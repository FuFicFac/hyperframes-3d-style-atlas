// styles/crt-retro/style.js — "CRT Retro": a beige 1970s–80s terminal on a wood desk at night.
// Implements the style contract (references/kit-api.md §3).
//
// Frame: desk top = y 0, the monitor bezel faces +Z (camera side), wall behind. The CRT content is drawn every
// frame into a 2D canvas as a PURE function of t (screen.js plan -> cells, cursor, wipes, inverts) and shown
// through a CRT ShaderMaterial on a curved tube (barrel, raster power animation, scanlines with derivative
// fade, grille hint, mip-blur halation, per-line jitter, roll band, vignette). No pass or canvas keeps history:
// "persistence" is analytic (each character flashes from its own reveal time; the cursor trail decays from when
// the cursor left a cell). Nothing animates itself: scenes call workstation.userData.update(t) from renderAt.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { makeCanvas, canvasTexture, paintPixels, fbm2, noiseTexture, woodTexture, speckleTexture, bumpFromNoise } from "../../kit/textures.js";
import { createTextLabel } from "../../kit/text.js";
import { sweepGeometry, sagPoints } from "../../kit/paths.js";
import { contactShadow } from "../../kit/builders.js";
import { pinToScreen } from "../../kit/overlay.js";
import { clamp, lerp, ease, hash01 } from "../../kit/time.js";
import * as SCREEN from "./screen.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC, SCREEN };

const { GLYPHS, BOX_CHARS, CELL } = SCREEN;

/** createStyle(stage, opts?) -> style        opts: { post = true } */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const P = spec.palette, HW = spec.hardware;
  const textStyle = { font: spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  // ------------------------------------------------------------------ surface textures
  const TX = spec.textures;
  const yel = TX.yellowing;
  const yellowMap = canvasTexture(paintPixels(yel.size, (u, v) => {
    const n = fbm2(u * 4, v * 4, { seed: yel.seed, octaves: 4, period: 4 });
    const k = yel.amount * (n - 0.35) * 2;
    return [1 - k * 0.15, 1 - k * 0.45, 1 - k];
  }), { repeat: [1, 1] });
  const plasticBump = bumpFromNoise({ ...TX.plastic, repeat: [3, 3] });
  for (const m of [materials.plastic, materials.plasticDark]) {
    m.map = yellowMap;
    m.bumpMap = plasticBump;
    m.bumpScale = 0.18;
    m.needsUpdate = true;
  }
  materials.keyAlpha.bumpMap = plasticBump;
  materials.keyAlpha.bumpScale = 0.12;
  materials.wall.map = noiseTexture({ ...TX.wall, repeat: [4, 2] });
  materials.wall.needsUpdate = true;
  materials.wood.map = woodTexture({ ...TX.wood, repeat: [2, 1.2] });
  materials.wood.needsUpdate = true;
  materials.cork.map = speckleTexture({ ...TX.cork, dot: TX.cork.dots, repeat: [2, 1.4] });
  materials.cork.needsUpdate = true;
  materials.shadeInner = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }); // unlit glowing inside of the shade, bright at the bulb, dark at the rim
  materials.bulb = new THREE.MeshStandardMaterial({ color: "#fff4dc", emissive: spec.lamp.color, emissiveIntensity: spec.lamp.bulb });
  materials.coffee = new THREE.MeshStandardMaterial({ color: "#1a0f08", roughness: 0.15 });

  const mesh = (geo, mat, cast = true, receive = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  };
  const roundRectShape = (w, h, r, cx = 0, cy = 0, path = new THREE.Shape()) => {
    const x0 = cx - w / 2, y0 = cy - h / 2;
    path.moveTo(x0 + r, y0);
    path.lineTo(x0 + w - r, y0);
    path.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    path.lineTo(x0 + w, y0 + h - r);
    path.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    path.lineTo(x0 + r, y0 + h);
    path.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    path.lineTo(x0, y0 + r);
    path.quadraticCurveTo(x0, y0, x0 + r, y0);
    return path;
  };

  // ==================================================================================================
  // CRT screen: content canvas (pure f(t)) + CRT shader
  // ==================================================================================================
  /**
   * crtScreen({ phosphor, cols, rows, ...crt knobs }) -> screen
   *   screen = { canvas, texture, material, plan, setPlan(plan), program(items) -> plan, draw(t) -> load, set(t), phosphor }
   *   draw(t) repaints the canvas from the plan (pure); set(t) updates the shader (power raster, jitter, roll).
   */
  function crtScreen(o = {}) {
    const C = { ...spec.crt, ...o };
    const PH = spec.phosphors[C.phosphor] ?? spec.phosphors.green;
    const u = C.unitPx, cw = CELL.w * u, ch = CELL.h * u;
    const W = C.cols * cw + 2 * C.pad[0], H = C.rows * ch + 2 * C.pad[1];
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace; // intensity data; the shader colours it
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    let plan = SCREEN.planScreen([], { cols: C.cols, rows: C.rows, typing: spec.typing });

    const gray = (k) => { const v = Math.round(clamp(k) * 255); return `rgb(${v},${v},${v})`; };
    const X = (col) => C.pad[0] + col * cw, Y = (row) => C.pad[1] + row * ch;
    function glyph(chr, x, y, s, k) {
      ctx.fillStyle = gray(k);
      const U = u * s;
      if (chr === "█") { ctx.fillRect(x, y + U * CELL.glyphTop, CELL.w * U, 7 * U); return; }
      const box = BOX_CHARS[chr];
      if (box) {
        const cx = x + 2 * U, cy = y + (CELL.glyphTop + 3) * U;
        if (box[0]) ctx.fillRect(x, cy, 3 * U, U);
        if (box[2]) ctx.fillRect(cx, cy, CELL.w * U - 2 * U, U);
        if (box[1]) ctx.fillRect(cx, y, U, cy - y + U);
        if (box[3]) ctx.fillRect(cx, cy, U, CELL.h * U - (cy - y));
        return;
      }
      const g = GLYPHS[chr] ?? GLYPHS["?"];
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        let run = -1;
        for (let c = 0; c <= 5; c++) {
          const on = c < 5 && row[c] === "#";
          if (on && run < 0) run = c;
          if (!on && run >= 0) { ctx.fillRect(x + run * U, y + (CELL.glyphTop + r) * U, (c - run) * U, U); run = -1; }
        }
      }
    }
    let lastLoad = 0;
    function draw(t) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const base = 0.72, dimK = 0.42;
      let lit = 0;
      // inverse-video spans (sweep in over dur)
      const inv = new Map();
      for (const v of plan.inverts) {
        if (t < v.at || t >= v.off) continue;
        const n = Math.min(v.len, Math.floor(((t - v.at) / v.dur) * v.len + 1e-6) + 1);
        for (let k = 0; k < n; k++) inv.set(`${v.row},${v.col + k}`, Math.min(1, ((t - v.at) / v.dur) * v.len - k + 1));
      }
      for (const [key] of inv) {
        const [r, c] = key.split(",").map(Number);
        ctx.fillStyle = gray(base * C.invertLevel);
        ctx.fillRect(X(c), Y(r) + u * (CELL.glyphTop - 1), cw, 9 * u);
        lit += 30;
      }
      // cursor trail (analytic persistence: decays from the moment the cursor left the cell)
      for (const p of SCREEN.cursorTrail(plan, t, C.ghostTau * 5)) {
        const k = base * C.cursorGhost * Math.min(1, p.dwell / 0.08) * Math.exp(-(t - p.left) / C.ghostTau); // fast prints leave little trail
        ctx.fillStyle = gray(k);
        ctx.fillRect(X(p.col), Y(p.row) + u * CELL.glyphTop * p.scale, 5 * u * p.scale, 7 * u * p.scale);
      }
      // characters (flash from their own reveal time)
      for (const c of plan.cells) {
        if (t < c.on || t >= c.off) continue;
        const age = t - c.on;
        const k = (c.dim ? dimK : base) * (1 + C.flash * Math.exp(-age / C.flashTau));
        const isInv = inv.has(`${c.row},${c.col}`);
        glyph(c.ch, X(c.col), Y(c.row), c.scale, isInv ? 0 : k);
        lit += isInv ? 0 : 14 * c.scale * c.scale * k;
      }
      // block cursor: solid while moving, blinking when idle
      const pw = SCREEN.powerAt(plan, t);
      const cur = SCREEN.cursorAt(plan, t);
      if (pw.on && cur.show && t > pw.at + 0.5) {
        const idle = t - Math.max(cur.since, pw.at);
        const on = idle < C.blinkIdle || ((idle - C.blinkIdle) % C.blinkPeriod) < C.blinkPeriod / 2;
        if (on) {
          ctx.fillStyle = gray(base * 1.05);
          ctx.fillRect(X(cur.col), Y(cur.row) + u * CELL.glyphTop * cur.scale, 5 * u * cur.scale, 7 * u * cur.scale);
          lit += 35;
        }
      }
      // clear beam: a bright band leading the wipe
      const beam = SCREEN.wipeBeam(plan, t);
      if (beam) {
        const yb = C.pad[1] + beam.y * C.rows * ch, bh = C.wipeBand * H;
        const gr = ctx.createLinearGradient(0, yb - bh, 0, yb);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.85, "rgba(255,255,255,0.35)");
        gr.addColorStop(1, "rgba(255,255,255,0.9)");
        ctx.fillStyle = gr;
        ctx.fillRect(C.pad[0] * 0.5, yb - bh, W - C.pad[0], bh);
        lit += 400;
      }
      texture.needsUpdate = true;
      lastLoad = clamp(lit / (C.cols * C.rows * 35 * 0.18), 0, 1.4);
      return lastLoad;
    }

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uScreen: { value: texture },
        uColor: { value: new THREE.Color(PH.color) },
        uCore: { value: new THREE.Color(PH.core) },
        uBg: { value: new THREE.Color(PH.bg) },
        uOff: { value: new THREE.Color(P.tubeOff).multiplyScalar(0.05) },
        uLevel: { value: C.textLevel },
        uBlack: { value: C.blackLevel },
        uBarrel: { value: C.barrel },
        uScan: { value: C.scanlines },
        uLines: { value: H / u },
        uMask: { value: C.mask },
        uTriads: { value: C.maskTriads },
        uHal: { value: C.halation },
        uJitter: { value: C.jitter },
        uFrame: { value: 0 },
        uRoll: { value: C.roll },
        uRollPhase: { value: 0 },
        uVig: { value: C.vignette },
        uSoft: { value: C.cornerSoft },
        uReflect: { value: C.reflect },
        uRaster: { value: new THREE.Vector2(0, 0) },
        uGain: { value: 0 },
        uBeam: { value: 0 },
        uDot: { value: 0 },
        uOn: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uScreen; uniform vec3 uColor, uCore, uBg, uOff;
        uniform float uLevel, uBlack, uBarrel, uScan, uLines, uMask, uTriads, uHal, uJitter, uFrame, uRoll, uRollPhase,
                      uVig, uSoft, uReflect, uGain, uBeam, uDot, uOn;
        uniform vec2 uRaster; varying vec2 vUv;
        float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
        void main(){
          vec2 c = vUv * 2.0 - 1.0;
          vec2 cc = c * (1.0 + uBarrel * dot(c, c));            // barrel: the raster bows, corners fall off the tube
          vec2 r = cc / max(uRaster, vec2(1e-4));                  // power-on/off: deflection squashes the raster
          float line = floor((r.y * 0.5 + 0.5) * uLines);
          r.x += uJitter * (hash(vec2(line, uFrame)) - 0.5) * 2.0;
          vec2 uv = r * 0.5 + 0.5;
          vec2 e = smoothstep(vec2(0.0), vec2(uSoft), uv) * smoothstep(vec2(0.0), vec2(uSoft), 1.0 - uv);
          float inside = e.x * e.y * step(1e-3, uRaster.y);
          float I = texture2D(uScreen, uv).r;
          float g = 0.55 * texture2D(uScreen, uv, 2.5).r + 0.45 * texture2D(uScreen, uv, 4.5).r;
          // scanlines (fade out when finer than ~2 px so a moving camera never moirés)
          float fw = fwidth(uv.y * uLines);
          float sAmt = uScan * (1.0 - smoothstep(0.28, 0.55, fw));
          float s = fract(uv.y * uLines);
          float scan = 1.0 - sAmt * 0.5 * (1.0 - cos(6.2831853 * (s - 0.5)));
          scan = mix(scan, 1.0, clamp(I * 0.35, 0.0, 0.35));     // bright phosphor blooms into the gap
          // aperture-grille hint, on the glass (not the raster), derivative-faded
          float mx = vUv.x * uTriads;
          float mAmt = uMask * (1.0 - smoothstep(0.22, 0.45, fwidth(mx)));
          float grille = 1.0 - mAmt * 0.5 * (1.0 - cos(6.2831853 * mx));
          float b = fract(uv.y - uRollPhase);
          float roll = 1.0 + uRoll * exp(-pow((b - 0.5) * 7.0, 2.0));
          vec2 q = clamp(uv, 0.0, 1.0);
          float vig = pow(clamp(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.0, 1.0), uVig);
          vec3 txt = mix(uColor, uCore, clamp(I * I * 0.5, 0.0, 1.0)) * I;
          vec3 col = (txt * scan * grille + uColor * g * uHal) * uLevel * roll;
          col += uBg * uBlack * 6.0 * uOn;                         // lit-but-black raster
          col *= vig * inside * uGain;
          // power line / dot: deflection collapsed, beam energy concentrated
          float lineK = exp(-pow(cc.y / (min(uRaster.y, 0.04) + 0.006), 2.0)) * smoothstep(uRaster.x + 0.02, uRaster.x - 0.02, abs(cc.x));
          col += mix(uColor, uCore, 0.7) * uBeam * lineK * 2.5;
          col += mix(uColor, uCore, 0.85) * uDot * (exp(-dot(cc, cc) / 0.0009) * 3.0 + exp(-dot(cc, cc) / 0.012) * 0.4);
          // glass: unpowered tint + painted soft highlight (the lamp, upper left) + rim sheen
          vec2 hp = (c - vec2(-0.5, 0.62)) * vec2(1.0, 2.4);
          float hl = uReflect * (exp(-dot(hp, hp) * 3.5) + 0.25 * smoothstep(0.75, 1.0, length(c * vec2(0.9, 1.0))));
          col += uOff + vec3(1.0, 0.92, 0.82) * hl;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    material.name = "crtScreen";

    /** tubeState(t) -> raster scale, gain, beam line and dot levels for the power animation (pure). */
    function tubeState(t) {
      const PW = C.power;
      const p = SCREEN.powerAt(plan, t);
      if (p.at === -Infinity) return { sx: 0, sy: 0, gain: 0, beam: 0, dot: 0, on: 0, level: 0 };
      const v = t - p.at;
      if (p.on) {
        if (v < PW.lineDur) {
          const k = v / PW.lineDur;
          return { sx: ease.outCubic(k), sy: 0.002, gain: 0, beam: 0.6 + 0.6 * k, dot: 0, on: 0, level: 0.6 };
        }
        const w = v - PW.lineDur;
        const k = clamp(w / PW.openDur);
        const sy = lerp(0.002, 1, ease.outCubic(k));
        const bloom = 1 + PW.bloom * Math.exp(-w / (PW.bloomDur / 3));
        return { sx: 1, sy, gain: bloom * (0.35 + 0.65 * k), beam: 1.2 * (1 - k) ** 2, dot: 0, on: 1, level: Math.min(1, k) };
      }
      if (v < PW.offLine) {
        const k = v / PW.offLine;
        return { sx: 1, sy: lerp(1, 0.002, ease.inQuad(k)), gain: 1 + 1.2 * k, beam: 1.4 * k * k, dot: 0, on: 1 - k, level: 1 - k };
      }
      if (v < PW.offLine + PW.offDot) {
        const k = (v - PW.offLine) / PW.offDot;
        return { sx: lerp(1, 0.004, ease.inQuad(k)), sy: 0.002, gain: 0, beam: 1.4, dot: k, on: 0, level: 0.2 };
      }
      const d = v - PW.offLine - PW.offDot;
      return { sx: 0.004, sy: 0.002, gain: 0, beam: 0, dot: Math.exp(-d / (PW.dotFade / 3)), on: 0, level: 0 };
    }

    const screen = {
      canvas, texture, material, phosphor: PH, knobs: C,
      get plan() { return plan; },
      setPlan(p) { plan = p; return plan; },
      program(items) { plan = SCREEN.planScreen(items, { cols: C.cols, rows: C.rows, typing: spec.typing, seed: C.seed }); return plan; },
      draw,
      tubeState,
      /** set(t) -> { load, state }: repaint + shader uniforms for time t. */
      set(t) {
        const st = tubeState(t);
        const load = draw(t);
        const U = material.uniforms;
        U.uRaster.value.set(st.sx, st.sy);
        U.uGain.value = st.gain;
        U.uBeam.value = st.beam;
        U.uDot.value = st.dot;
        U.uOn.value = st.on;
        U.uFrame.value = Math.floor(t * 30 + 1e-6);
        U.uRollPhase.value = t * C.rollSpeed;
        return { load, state: st };
      },
    };
    return screen;
  }

  /** tubeGeometry({ w, h, R, seg }) -> curved glass face (spherical cap section), UV 0..1, facing +Z, rim at z = 0. */
  function tubeGeometry(o = {}) {
    const T = { ...HW.monitor.tube, ...o };
    const g = new THREE.PlaneGeometry(T.w, T.h, o.seg ?? 64, Math.round((o.seg ?? 64) * 0.75));
    const pos = g.attributes.position;
    const rim = Math.sqrt(T.R * T.R - (T.w / 2) ** 2 - (T.h / 2) ** 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, Math.sqrt(T.R * T.R - x * x - y * y) - rim);
    }
    g.computeVertexNormals();
    return g;
  }

  /**
   * glassShell(geometry) -> additive reflection-only glass over the tube: the room environment at `crt.glassEnv`
   * (MeshBasic + envMap, so lamps and the screen's own spill never make hotspots that hide the text). The lamp
   * highlight is painted in the CRT shader (crt.reflect) where it can't cover content.
   */
  function glassShell(geo) {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      envMap: stage.scene.environment ?? null, combine: THREE.AddOperation, reflectivity: spec.crt.glassEnv });
    m.name = "tubeGlass";
    const s = new THREE.Mesh(geo, m);
    s.position.z = 0.0015;
    s.renderOrder = 2;
    return s;
  }

  // ==================================================================================================
  // Hardware
  // ==================================================================================================
  /**
   * monitor({ screen, phosphor }) -> Group (origin: bottom centre of the bezel front face; faces +Z)
   *   userData: { screen, tube, glass, spill, bounce, led, tubeCentre, update(t) -> {load,state} }
   */
  function monitor(o = {}) {
    const M = HW.monitor;
    const g = new THREE.Group();
    g.name = "monitor";
    const scr = o.screen ?? crtScreen({ phosphor: o.phosphor });
    const cy = M.h / 2; // bezel centre height
    const op = M.opening;
    // bezel: rounded slab with the screen opening, extruded toward -z, bevelled
    const shape = roundRectShape(M.w, M.h, M.radius);
    shape.holes.push(roundRectShape(op.w, op.h, op.r, 0, op.y));
    const bevel = 0.006;
    const bezelGeo = new THREE.ExtrudeGeometry(shape, { depth: M.bezelDepth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
    bezelGeo.translate(0, cy, -M.bezelDepth - bevel);
    g.add(mesh(bezelGeo, materials.plastic));
    // inner recess lip: a darker sloped frame just inside the opening
    const lipShape = roundRectShape(op.w + 0.016, op.h + 0.016, op.r + 0.008, 0, op.y);
    lipShape.holes.push(roundRectShape(op.w - 0.004, op.h - 0.004, op.r, 0, op.y));
    const lip = mesh(new THREE.ExtrudeGeometry(lipShape, { depth: 0.004, bevelEnabled: false, curveSegments: 10 }), materials.trim, false, true);
    lip.position.set(0, cy, -M.tube.recess - 0.012);
    g.add(lip);
    // hood: tapered rounded box behind the bezel (the CRT neck housing)
    const hoodGeo = new RoundedBoxGeometry(M.w - 0.01, M.h - 0.01, M.hoodDepth, 4, M.radius);
    const hp = hoodGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const z = hp.getZ(i);
      const k = clamp((M.hoodDepth / 2 - z) / M.hoodDepth) ** 1.15;
      const s = lerp(1, M.taper, k);
      hp.setX(i, hp.getX(i) * s);
      hp.setY(i, hp.getY(i) * s - (1 - s) * M.h * 0.18);
    }
    hoodGeo.computeVertexNormals();
    const hoodZ = -M.bezelDepth - bevel * 2 - M.hoodDepth / 2 + 0.004;
    const hood = mesh(hoodGeo, materials.plastic);
    hood.position.set(0, cy, hoodZ);
    g.add(hood);
    // top vents (moulded slots following the taper)
    const ventGeo = new THREE.BoxGeometry(0.006, 0.004, 0.07);
    const vents = new THREE.InstancedMesh(ventGeo, materials.vent, 22);
    const slopeK = (1 - M.taper) * 1.0;
    const topAt = (z) => { const k = clamp((-(z - (hoodZ + M.hoodDepth / 2))) / M.hoodDepth) ** 1.15; const s = lerp(1, M.taper, k); return cy + (M.h / 2 - 0.005) * s - (1 - s) * M.h * 0.18; };
    const dm = new THREE.Object3D();
    for (let i = 0; i < 22; i++) {
      const z = hoodZ - 0.02;
      const s = lerp(1, M.taper, clamp(0.5) ** 1.15);
      dm.position.set((i - 10.5) * 0.0125 * s, topAt(z) + 0.0005, z);
      dm.rotation.set(-Math.atan((M.h / 2) * slopeK / M.hoodDepth) * 0.9, 0, 0);
      dm.updateMatrix();
      vents.setMatrixAt(i, dm.matrix);
    }
    vents.receiveShadow = true;
    g.add(vents);
    // side vents (both sides)
    for (const sx of [-1, 1]) {
      const sv = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.005, 0.06), materials.vent, 8);
      for (let i = 0; i < 8; i++) {
        const z = hoodZ - 0.06;
        const s = lerp(1, M.taper, 0.55);
        dm.position.set(sx * ((M.w / 2 - 0.005) * s), cy + 0.06 - i * 0.016 - (1 - s) * M.h * 0.18, z);
        dm.rotation.set(0, sx * Math.atan(((1 - M.taper) * M.w / 2) / M.hoodDepth), 0);
        dm.updateMatrix();
        sv.setMatrixAt(i, dm.matrix);
      }
      g.add(sv);
    }
    // the tube + glass
    const tubeGeo = tubeGeometry();
    const tube = new THREE.Mesh(tubeGeo, scr.material);
    tube.position.set(0, cy + op.y, -M.tube.recess);
    tube.castShadow = false;
    g.add(tube);
    const glass = glassShell(tubeGeo);
    glass.castShadow = false;
    tube.add(glass);
    // controls strip under the opening: badge, LED, knobs, rocker
    const stripY = (cy + op.y - op.h / 2 + 0) / 2 + 0.002;
    const badge = mesh(new RoundedBoxGeometry(0.07, 0.016, 0.004, 2, 0.003), materials.trim, false, true);
    badge.position.set(-M.w / 2 + 0.075, stripY, 0.001);
    g.add(badge);
    const rule = mesh(new THREE.BoxGeometry(0.05, 0.0018, 0.001), materials.chrome, false, false);
    rule.position.set(-M.w / 2 + 0.075, stripY + 0.002, 0.0035);
    g.add(rule);
    const rule2 = rule.clone();
    rule2.scale.x = 0.6;
    rule2.position.set(-M.w / 2 + 0.065, stripY - 0.003, 0.0035);
    g.add(rule2);
    const led = mesh(new THREE.SphereGeometry(0.0032, 16, 12), materials.led.clone(), false, false);
    led.position.set(M.w / 2 - 0.04, stripY, 0.001);
    g.add(led);
    for (let k = 0; k < 2; k++) {
      const knob = mesh(new THREE.CylinderGeometry(0.0085, 0.0095, 0.012, 24), materials.trim);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(M.w / 2 - 0.085 - k * 0.032, stripY, 0.005);
      g.add(knob);
    }
    // feet
    for (const fx of [-1, 1]) {
      const foot = mesh(new THREE.BoxGeometry(0.05, M.feet, 0.04), materials.trim);
      foot.position.set(fx * (M.w / 2 - 0.06), -M.feet / 2, -0.12);
      g.add(foot);
    }
    // glow spill: spot from the glass toward the keys/desk + soft bounce for the wall and desk
    const SP = spec.spill;
    const spill = new THREE.SpotLight(scr.phosphor.spill, 0, SP.distance, SP.angle, SP.penumbra, 2);
    spill.position.set(0, cy + op.y, -M.tube.recess - 0.005); // behind the glass: lights the room through the opening, never a hotspot on the tube
    spill.target.position.set(0, -0.25, 0.6);
    spill.castShadow = true;
    spill.shadow.mapSize.set(1024, 1024);
    spill.shadow.radius = 4;
    spill.shadow.bias = -0.0004;
    spill.shadow.camera.near = 0.03;
    spill.shadow.camera.far = 2.5;
    g.add(spill, spill.target);
    const bounce = new THREE.PointLight(scr.phosphor.spill, 0, SP.bounceDistance, 2);
    bounce.position.set(0, -0.07, 0.3); // low, in front: desk + keys, grazing the bezel
    g.add(bounce);
    const ledBase = materials.led.emissiveIntensity ?? 1.6;
    g.userData = {
      screen: scr, tube, glass, spill, bounce, led,
      tubeCentre: [0, cy + op.y, -M.tube.recess],
      update(t) {
        const r = scr.set(t);
        const pw = SCREEN.powerAt(scr.plan, t);
        led.material.emissiveIntensity = pw.on ? ledBase : 0.02;
        const lv = r.state.level * (SP.idle + (1 - SP.idle) * Math.min(1, r.load)) * Math.max(1, r.state.gain * 0.7);
        spill.intensity = SP.intensity * lv;
        bounce.intensity = SP.bounce * lv;
        return r;
      },
    };
    return g;
  }

  /** systemUnit({ drives }) -> Group: beige base box with 5.25" drive bays, grille, busy LEDs. userData.setLed(level). */
  function systemUnit(o = {}) {
    const U = { ...HW.unit, ...o };
    const g = new THREE.Group();
    g.name = "systemUnit";
    const box = mesh(new RoundedBoxGeometry(U.w, U.h, U.d, 4, 0.012), materials.plasticDark);
    box.position.y = U.h / 2;
    g.add(box);
    const front = U.d / 2;
    const leds = [];
    for (let k = 0; k < U.drives; k++) {
      const x = 0.05 + k * 0.17 - 0.03;
      const bay = mesh(new RoundedBoxGeometry(0.15, 0.052, 0.01, 2, 0.004), materials.plastic);
      bay.position.set(x, U.h / 2, front + 0.002);
      g.add(bay);
      const slot = mesh(new THREE.BoxGeometry(0.12, 0.006, 0.006), materials.vent, false, false);
      slot.position.set(x, U.h / 2 + 0.006, front + 0.006);
      g.add(slot);
      const lever = mesh(new RoundedBoxGeometry(0.03, 0.012, 0.012, 2, 0.003), materials.trim);
      lever.position.set(x, U.h / 2 - 0.012, front + 0.01);
      g.add(lever);
      const led = mesh(new THREE.BoxGeometry(0.006, 0.003, 0.003), materials.led.clone(), false, false);
      led.material.emissiveIntensity = 0;
      led.position.set(x - 0.06, U.h / 2 - 0.016, front + 0.008);
      g.add(led);
      leds.push(led);
    }
    // grille on the left of the front face
    const gr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.003, 0.004), materials.vent, 7);
    const dm = new THREE.Object3D();
    for (let i = 0; i < 7; i++) {
      dm.position.set(-U.w / 2 + 0.08, U.h / 2 + 0.03 - i * 0.01, front + 0.0005);
      dm.updateMatrix();
      gr.setMatrixAt(i, dm.matrix);
    }
    g.add(gr);
    const rocker = mesh(new RoundedBoxGeometry(0.014, 0.024, 0.01, 2, 0.003), materials.trim);
    rocker.position.set(-U.w / 2 + 0.16, U.h / 2, front + 0.003);
    g.add(rocker);
    g.add(Object.assign(contactShadow({ w: U.w * 1.25, d: U.d * 1.25, opacity: 0.5 }), { name: "unitContact" }));
    g.userData = { leds, setLed(level, i = 0) { if (leds[i]) leds[i].material.emissiveIntensity = 1.6 * level; } };
    return g;
  }

  // ------------------------------------------------------------------ keyboard
  const KB = HW.keyboard;
  const legendAtlas = (() => {
    const labels = [...new Set(SCREEN.KEYBOARD_ROWS.flat().map((k) => k[0]).filter(Boolean))];
    const N = 8, cell = 128;
    const cv = makeCanvas(N * cell, N * cell);
    const cx = cv.getContext("2d");
    cx.fillStyle = "#fff";
    cx.textAlign = "center";
    cx.textBaseline = "middle";
    const index = {};
    labels.forEach((lab, i) => {
      const x = (i % N) * cell + cell / 2, y = Math.floor(i / N) * cell + cell / 2;
      cx.font = lab.length > 1 ? `700 ${lab.length > 4 ? 26 : 32}px "Helvetica Neue", Helvetica, Arial, sans-serif` : `700 64px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      if (lab.length > 1) cx.fillText(lab, x, y + 24); else cx.fillText(lab, x - 14, y - 12);
      index[lab] = i;
    });
    const tex = canvasTexture(cv, { srgb: true });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex, index, N };
  })();
  const legendMats = {
    a: new THREE.MeshStandardMaterial({ map: legendAtlas.tex, color: P.legend, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    m: new THREE.MeshStandardMaterial({ map: legendAtlas.tex, color: "#e8dcc0", transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const keyGeoCache = new Map();
  function keyGeo(w, d) {
    const k = `${w.toFixed(4)}x${d.toFixed(4)}`;
    if (keyGeoCache.has(k)) return keyGeoCache.get(k);
    const geo = new THREE.BoxGeometry(w, KB.keyH, d, 2, 1, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        pos.setX(i, pos.getX(i) - Math.sign(pos.getX(i)) * Math.min(0.0032, w * 0.12));
        pos.setZ(i, pos.getZ(i) * 0.8 + 0.0008);
      }
    }
    geo.computeVertexNormals();
    keyGeoCache.set(k, geo);
    return geo;
  }

  /**
   * keyboard({ phosphor }) -> Group (origin: desk contact centre; keys face up, rows run back -> front along +z)
   *   userData: { keys: { [id]: Group }, layout: [{ id, x, z, w }], update(t, presses) }   presses = SCREEN.keyPresses(plan)
   */
  function keyboard(o = {}) {
    const p = KB.pitch, gap = 0.0026;
    const rowsW = 14.5 * p;
    const W = rowsW + 2 * KB.margin[0];
    const D = 5 * p + 2 * KB.margin[1] + 0.016;
    const [h0, h1] = KB.caseH;
    const g = new THREE.Group();
    g.name = "keyboard";
    // case: side profile (front low, back high) extruded along x
    const prof = new THREE.Shape();
    const pr = [[D / 2, 0], [D / 2, h0 - 0.006], [D / 2 - 0.008, h0], [-D / 2 + 0.01, h1], [-D / 2, h1 - 0.01], [-D / 2, 0]];
    prof.moveTo(-pr[0][0], pr[0][1]);
    for (const q of pr.slice(1)) prof.lineTo(-q[0], q[1]);
    prof.closePath();
    const caseGeo = new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    caseGeo.rotateY(Math.PI / 2);
    caseGeo.translate(-W / 2, 0, 0);
    g.add(mesh(caseGeo, materials.plastic));
    const slope = Math.atan((h1 - h0) / D);
    const deck = new THREE.Group();
    deck.position.set(0, (h0 + h1) / 2 - 0.002, 0.006);
    deck.rotation.x = slope;
    g.add(deck);
    // key well (dark)
    const well = mesh(new THREE.BoxGeometry(rowsW + 0.008, 0.004, 5 * p + 0.008), materials.trim, false, true);
    well.position.set(0, 0.001, 0.004);
    deck.add(well);
    const keys = {}, layout = [];
    SCREEN.KEYBOARD_ROWS.forEach((row, ri) => {
      let x = -rowsW / 2;
      const z = -2.5 * p + (ri + 0.5) * p + 0.004;
      for (const [lab, wu = 1, kind = "a", id0] of row) {
        const id = id0 ?? lab;
        const w = wu * p - gap, d = p - gap;
        const kg = new THREE.Group();
        const cap = mesh(keyGeo(w, d), kind === "m" ? materials.keyMod : materials.keyAlpha);
        kg.add(cap);
        if (lab && legendAtlas.index[lab] != null) {
          const i = legendAtlas.index[lab], N = legendAtlas.N;
          const s = Math.min(d * 0.78, 0.017);
          const lg = new THREE.PlaneGeometry(s * (lab.length > 1 ? 1 : 1), s);
          const uvs = lg.attributes.uv;
          for (let v = 0; v < uvs.count; v++) uvs.setXY(v, ((i % N) + uvs.getX(v)) / N, 1 - (Math.floor(i / N) + 1 - uvs.getY(v)) / N);
          const lm = new THREE.Mesh(lg, legendMats[kind]);
          lm.rotation.x = -Math.PI / 2;
          lm.position.y = KB.keyH / 2 + 0.0004;
          lm.position.z = 0.0008;
          if (lab.length > 1 && wu > 1.2) lm.position.x = -w / 2 + s * 0.6;
          kg.add(lm);
        }
        const baseY = KB.keyH / 2 + 0.002;
        kg.position.set(x + (wu * p) / 2, baseY, z);
        kg.userData = { id, baseY };
        deck.add(kg);
        keys[id] = kg;
        layout.push({ id, x: x + (wu * p) / 2, z, w: wu * p });
        x += wu * p;
      }
    });
    // badge strip behind the keys
    const strip = mesh(new THREE.BoxGeometry(0.06, 0.002, 0.008), materials.trim, false, true);
    strip.position.set(rowsW / 2 - 0.04, 0.001, -2.5 * p - 0.008);
    deck.add(strip);
    g.add(Object.assign(contactShadow({ w: W * 1.2, d: D * 1.4, opacity: 0.55 }), { name: "kbContact" }));
    g.userData = {
      keys, layout, width: W, depth: D, backHeight: h1,
      update(t, presses) {
        for (const id in keys) {
          const k = keys[id];
          const dep = SCREEN.keyDepth(presses?.[id], t, spec.typing);
          k.position.y = k.userData.baseY - dep * KB.travel;
        }
      },
    };
    return g;
  }

  /** cable(points [[x,y,z]...], { r, sag }) -> beige coiled-look cable drooping between anchors. */
  function cable(anchors, o = {}) {
    const pts = sagPoints(anchors, { sag: o.sag ?? HW.cable.sag, step: 0.02 });
    return mesh(sweepGeometry(pts, o.r ?? HW.cable.r, 10), materials.cable);
  }

  /**
   * workstation({ phosphor, program }) -> Group: system unit + monitor on top + keyboard in front + cable.
   *   userData: { screen, monitor, keyboard, unit, plan, program(items) -> plan, update(t) -> { load, state } }
   *   update(t): repaint the screen, power raster, spill light, power/drive LEDs, key presses.
   */
  function workstation(o = {}) {
    const g = new THREE.Group();
    g.name = "workstation";
    const U = HW.unit;
    const unit = systemUnit();
    unit.position.z = U.z;
    g.add(unit);
    const scr = crtScreen({ phosphor: o.phosphor });
    const mon = monitor({ screen: scr });
    mon.position.set(0, U.h + HW.monitor.feet, U.z + U.d / 2 + 0.012);
    g.add(mon);
    const kb = keyboard();
    kb.position.set(0, KB.y, KB.z);
    g.add(kb);
    g.add(cable([[-0.06, 0.03, KB.z - kb.userData.depth / 2 + 0.004], [-0.13, 0.004, KB.z - kb.userData.depth / 2 - 0.08], [-0.19, 0.02, U.z + U.d / 2 + 0.001]], { sag: 0.12 }));
    let presses = {};
    const api = {
      screen: scr, monitor: mon, keyboard: kb, unit,
      get plan() { return scr.plan; },
      program(items) {
        const plan = scr.program(items);
        presses = SCREEN.keyPresses(plan, spec.typing);
        return plan;
      },
      update(t) {
        const r = mon.userData.update(t);
        kb.userData.update(t, presses);
        // drive busy LED: blinks for ~1.2 s after power-on (seeded per-frame hash, pure)
        const pw = SCREEN.powerAt(scr.plan, t);
        const v = t - pw.at;
        unit.userData.setLed(pw.on && v > 0.1 && v < 1.3 && hash01(Math.floor(t * 12), 5) > 0.35 ? 1 : 0);
        return r;
      },
    };
    if (o.program) api.program(o.program);
    g.userData = api;
    return g;
  }

  // ==================================================================================================
  // Room props
  // ==================================================================================================
  /** desk({ w, d, thick, z }) -> wood desk top (top surface at y = 0). */
  function desk(o = {}) {
    const w = o.w ?? 2.8, d = o.d ?? 1.1, th = o.thick ?? 0.045;
    const m = mesh(new RoundedBoxGeometry(w, th, d, 3, 0.008), materials.wood, false, true);
    m.position.set(0, -th / 2, o.z ?? 0.1);
    m.name = "desk";
    return m;
  }
  /** wall({ w, h, z }) -> painted plaster wall plane behind the desk. */
  function wall(o = {}) {
    const m = mesh(new THREE.PlaneGeometry(o.w ?? 4.5, o.h ?? 2.4), materials.wall, false, true);
    m.position.set(0, (o.h ?? 2.4) / 2 - 0.3, o.z ?? -0.42);
    m.name = "wall";
    return m;
  }

  /** handwriting(lines, { w, h, px, font, ink, paper, ruled }) -> CanvasTexture of a paper note. */
  function handwriting(lines, o = {}) {
    const W = o.px ?? 512, H = Math.round(W * (o.h ?? 0.75));
    const cv = paintPixels([W, H], (uu, vv) => {
      const n = fbm2(uu * 30, vv * 30, { seed: 9, octaves: 2, period: 30 });
      const base = [0.94, 0.9, 0.81];
      const edge = Math.min(uu, vv, 1 - uu, 1 - vv);
      const k = 0.96 + 0.05 * n - (edge < 0.03 ? 0.05 : 0);
      return base.map((c) => c * k);
    });
    const cx = cv.getContext("2d");
    if (o.ruled !== false) {
      cx.strokeStyle = "rgba(90,130,190,0.35)";
      cx.lineWidth = 2;
      for (let y = H * 0.3; y < H - 10; y += H * 0.17) { cx.beginPath(); cx.moveTo(10, y); cx.lineTo(W - 10, y); cx.stroke(); }
    }
    cx.fillStyle = o.ink ?? P.ink;
    cx.textBaseline = "alphabetic";
    lines.forEach((ln, i) => {
      const L = typeof ln === "string" ? { text: ln } : ln;
      cx.font = `${L.weight ?? 400} ${Math.round((L.size ?? 0.13) * H)}px ${o.font ?? '"Marker Felt", "Bradley Hand", "Chalkboard SE", cursive'}`;
      cx.save();
      cx.translate(W * (L.x ?? 0.08), H * (L.y ?? 0.27 + i * 0.17));
      cx.rotate(L.rot ?? -0.03);
      cx.fillText(L.text, 0, 0);
      cx.restore();
    });
    if (o.underline) { cx.strokeStyle = o.ink ?? P.ink; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(W * 0.08, H * 0.31); cx.lineTo(W * 0.62, H * 0.29); cx.stroke(); }
    return canvasTexture(cv);
  }

  /** corkBoard({ w, h, notes:[{ lines, w, h, x, y, rot }] }) -> framed cork board for the wall with pinned notes. */
  function corkBoard(o = {}) {
    const w = o.w ?? 0.5, h = o.h ?? 0.34;
    const g = new THREE.Group();
    g.name = "corkBoard";
    const cork = mesh(new THREE.BoxGeometry(w, h, 0.012), materials.cork, true, true);
    g.add(cork);
    const fw = 0.016;
    for (const [x, y, ww, hh] of [[0, h / 2 + fw / 2, w + 2 * fw, fw], [0, -h / 2 - fw / 2, w + 2 * fw, fw], [-w / 2 - fw / 2, 0, fw, h], [w / 2 + fw / 2, 0, fw, h]]) {
      const b = mesh(new THREE.BoxGeometry(ww, hh, 0.02), materials.frame);
      b.position.set(x, y, 0.002);
      g.add(b);
    }
    for (const n of o.notes ?? []) g.add(pinnedNote(n));
    return g;
  }

  /** pinnedNote({ lines, w, h, x, y, rot, pin }) -> paper note with a push pin (local z = board front). */
  function pinnedNote(o = {}) {
    const w = o.w ?? 0.13, h = o.h ?? 0.095;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: handwriting(o.lines ?? ["NOTE"], { h: h / w, ruled: o.ruled, underline: o.underline }), roughness: 0.85 });
    const paper = mesh(new THREE.PlaneGeometry(w, h, 4, 4), mat, false, true);
    const pp = paper.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, 0.002 * (Math.abs(pp.getY(i) + h / 2) / h) ** 2 + 0.0015 * Math.max(0, -pp.getY(i) / h)); // corner curl
    paper.geometry.computeVertexNormals();
    paper.position.z = 0.0075;
    g.add(paper);
    const head = mesh(new THREE.CylinderGeometry(0.006, 0.0075, 0.008, 18), materials.pin);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, h / 2 - 0.012, 0.013);
    g.add(head);
    g.position.set(o.x ?? 0, o.y ?? 0, 0);
    g.rotation.z = o.rot ?? 0.03;
    return g;
  }

  /** deskLamp({ base:[x,z], head:[x,y,z], aim:[x,y,z] }) -> articulated lamp with a warm SpotLight + leak light. userData.setLevel(k). */
  function deskLamp(o = {}) {
    const L = spec.lamp;
    const g = new THREE.Group();
    g.name = "deskLamp";
    const [bx, bz] = o.base ?? [0.82, -0.22];
    const head = new THREE.Vector3(...(o.head ?? [0.56, 0.44, 0.04]));
    const aim = new THREE.Vector3(...(o.aim ?? [0.44, 0, 0.32]));
    const baseTop = new THREE.Vector3(bx, 0.022, bz);
    const elbow = new THREE.Vector3(...(o.elbow ?? [bx - 0.03, 0.46, bz + 0.04]));
    const base = mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.022, 40), materials.lampMetal);
    base.position.set(bx, 0.011, bz);
    g.add(base);
    const rod = (a, b, r = 0.0055) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), materials.lampMetal);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      return m;
    };
    const side = new THREE.Vector3(0.012, 0, 0);
    g.add(rod(baseTop.clone().add(side), elbow.clone().add(side)), rod(baseTop.clone().sub(side), elbow.clone().sub(side)));
    g.add(rod(elbow, head, 0.005));
    for (const p of [baseTop, elbow]) { const j = mesh(new THREE.SphereGeometry(0.011, 16, 12), materials.chrome); j.position.copy(p); g.add(j); }
    const spring = rod(baseTop.clone().add(new THREE.Vector3(0, 0.06, 0.012)), elbow.clone().add(new THREE.Vector3(0, -0.12, 0.012)), 0.0025);
    spring.material = materials.chrome;
    g.add(spring);
    // shade: open cone pointing at aim
    const dir = new THREE.Vector3().subVectors(aim, head).normalize();
    const shade = new THREE.Group();
    shade.position.copy(head);
    shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const coneGeo = new THREE.CylinderGeometry(0.022, 0.078, 0.13, 40, 1, true);
    coneGeo.translate(0, -0.05, 0);
    const innerGeo = coneGeo.clone();
    const ip = innerGeo.attributes.position, cols = [];
    const cA = new THREE.Color(L.innerShade), cB = new THREE.Color(L.innerRim);
    for (let i = 0; i < ip.count; i++) { const k = clamp((0.015 - ip.getY(i)) / 0.13); const c = cA.clone().lerp(cB, k ** 0.45); cols.push(c.r, c.g, c.b); }
    innerGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    shade.add(mesh(coneGeo, materials.lampMetal), mesh(innerGeo, materials.shadeInner, false, false));
    const cap = mesh(new THREE.SphereGeometry(0.03, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), materials.lampMetal);
    cap.position.y = 0.012;
    shade.add(cap);
    const bulb = mesh(new THREE.SphereGeometry(0.026, 24, 16), materials.bulb, false, false);
    bulb.position.y = -0.04;
    shade.add(bulb);
    g.add(shade);
    const bulbW = head.clone().addScaledVector(dir, 0.045);
    const spot = new THREE.SpotLight(L.color, L.intensity, L.distance, L.angle, L.penumbra, 2);
    spot.position.copy(bulbW);
    spot.target.position.copy(aim);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.radius = 5;
    spot.shadow.bias = -0.0003;
    spot.shadow.camera.near = 0.05;
    spot.shadow.camera.far = 3;
    g.add(spot, spot.target);
    const leak = new THREE.PointLight(L.color, L.leak, 1.6, 2);
    leak.position.copy(head).addScaledVector(dir, -0.06);
    g.add(leak);
    const lc = contactShadow({ w: 0.22, opacity: 0.5 });
    lc.position.set(bx, 0.004, bz);
    g.add(lc);
    g.userData = { spot, leak, bulb, setLevel(k) { spot.intensity = L.intensity * k; leak.intensity = L.leak * k; materials.bulb.emissiveIntensity = L.bulb * k; } };
    return g;
  }

  /** mug({ pencils }) -> glazed mug (lathe) with handle and optional pencils. */
  function mug(o = {}) {
    const g = new THREE.Group();
    g.name = "mug";
    const R = 0.042, Hh = 0.095, th = 0.004;
    const prof = [[0, 0], [R - 0.004, 0], [R, 0.004], [R + 0.002, Hh], [R - th, Hh], [R - th - 0.001, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(mesh(new THREE.LatheGeometry(prof, 48), materials.mug));
    const handle = mesh(new THREE.TorusGeometry(0.026, 0.0065, 12, 32, Math.PI * 1.15), materials.mug);
    handle.rotation.z = -Math.PI * 0.575;
    handle.position.set(R + 0.004, Hh * 0.52, 0);
    g.add(handle);
    if (o.pencils !== false) {
      for (const [ax, az, len, c] of [[0.1, 0.06, 0.17, materials.pencil], [-0.14, -0.05, 0.16, materials.pencil], [0.02, -0.16, 0.15, materials.chrome]]) {
        const pg = new THREE.Group();
        const body = mesh(new THREE.CylinderGeometry(0.0038, 0.0038, len, 6), c);
        body.position.y = len / 2;
        pg.add(body);
        const tip = mesh(new THREE.ConeGeometry(0.0038, 0.014, 6), materials.cable);
        tip.position.y = len + 0.007;
        pg.add(tip);
        pg.position.set(ax * 0.12, 0.01, az * 0.12);
        pg.rotation.set(az, 0, -ax);
        g.add(pg);
      }
    }
    g.add(contactShadow({ w: 0.13, opacity: 0.55 }));
    return g;
  }

  /** floppy({ label, rot }) -> 5.25" disk in a black sleeve with a handwritten label. */
  function floppy(o = {}) {
    const g = new THREE.Group();
    const s = 0.133;
    const body = mesh(new THREE.BoxGeometry(s, 0.0022, s), materials.disk);
    body.position.y = 0.0011;
    g.add(body);
    const lab = mesh(new THREE.PlaneGeometry(0.075, 0.03), new THREE.MeshStandardMaterial({ map: handwriting([{ text: o.label ?? "ELIZA", size: 0.42, y: 0.62, x: 0.08 }], { h: 0.4, px: 384 }), roughness: 0.9 }), false, true);
    lab.rotation.x = -Math.PI / 2;
    lab.position.set(-0.012, 0.0024, -0.042);
    g.add(lab);
    const hub = mesh(new THREE.RingGeometry(0.008, 0.018, 32), new THREE.MeshStandardMaterial({ color: "#5d4a37", roughness: 0.6 }), false, true);
    hub.rotation.x = -Math.PI / 2;
    hub.position.y = 0.0024;
    g.add(hub);
    const slot = mesh(new THREE.PlaneGeometry(0.012, 0.035), new THREE.MeshStandardMaterial({ color: "#3a2f26", roughness: 0.4 }), false, true);
    slot.rotation.x = -Math.PI / 2;
    slot.position.set(0, 0.0024, 0.038);
    g.add(slot);
    g.rotation.y = o.rot ?? 0;
    return g;
  }

  // ==================================================================================================
  // Caption (overlay, exact colours): 5x7 pixel font on a dark plate with a phosphor bar, typed on
  // ==================================================================================================
  /**
   * caption(text, { phosphor }) -> Mesh on the overlay. userData.update(t, { on, off }) types it in at caption.cps
   * from `on`, holds, fades out over .35 s from `off`. Redraws only when the visible character count changes (pure memo).
   */
  function caption(text, o = {}) {
    const CP = { ...spec.caption, ...o };
    const PH = spec.phosphors[o.phosphor ?? spec.crt.phosphor];
    const lines = String(text).split("\n");
    const maxLen = Math.max(...lines.map((l) => l.length));
    const u = CP.unitPx;
    const wU = maxLen * 6 - 1 + 2 * CP.padUnits[0] + CP.bar + 2, hU = lines.length * 10 - 3 + 2 * CP.padUnits[1];
    const cv = makeCanvas(wU * u, hU * u);
    const cx = cv.getContext("2d");
    const tex = canvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wU / hU, 1), mat);
    m.name = "caption";
    m.renderOrder = 10;
    let shown = -1;
    const total = [...text.replace(/\n/g, "")].length;
    function paint(n) {
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.fillStyle = P.captionPlate;
      cx.globalAlpha = 0.86;
      cx.fillRect(0, 0, cv.width, cv.height);
      cx.globalAlpha = 1;
      cx.fillStyle = PH.color;
      cx.fillRect(CP.padUnits[0] * u * 0.5, CP.padUnits[1] * u, CP.bar * u, (hU - 2 * CP.padUnits[1]) * u);
      cx.fillStyle = P.caption;
      let k = 0;
      lines.forEach((ln, li) => {
        [...ln].forEach((chr, ci) => {
          if (k++ >= n) return;
          const g = GLYPHS[chr];
          if (!g) return;
          const x0 = (CP.padUnits[0] + CP.bar + 2 + ci * 6) * u, y0 = (CP.padUnits[1] + li * 10) * u;
          for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r][c] === "#") cx.fillRect(x0 + c * u, y0 + r * u, u, u);
        });
      });
      if (n < total) { // typing cursor
        const li = lines.length - 1;
        const x0 = (CP.padUnits[0] + CP.bar + 2 + Math.min(n, lines[li].length) * 6) * u;
        cx.fillStyle = PH.color;
        cx.fillRect(x0, (CP.padUnits[1] + li * 10) * u, 5 * u, 7 * u);
      }
      tex.needsUpdate = true;
    }
    m.userData.textHeightPx = 7 * u;
    m.userData.update = (t, { on, off = Infinity }) => {
      const n = t < on ? 0 : Math.min(total, Math.floor((t - on) * CP.cps + 1e-6) + 1);
      if (n !== shown) { paint(n); shown = n; }
      const a = clamp((t - on) / 0.12) * (1 - clamp((t - off) / 0.35));
      mat.opacity = a;
      m.visible = a > 0.001;
      // 1 plane unit = plate height; plate height = text px * hU / 7 at 1080
      pinToScreen(stage, m, { x: CP.x, y: CP.y, height: (CP.height * hU) / 7 });
    };
    return m;
  }

  const props = { workstation, monitor, crtScreen, tubeGeometry, glassShell, systemUnit, keyboard, cable, desk, wall, corkBoard, pinnedNote, deskLamp, mug, floppy, caption, handwriting,
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }) };
  const dims = (o) => o.dims ?? {};
  return {
    spec,
    palette: P,
    materials,
    lights,
    post,
    textStyle,
    camera: spec.camera,
    props,
    factories: {
      workstation: (o) => workstation(dims(o)),
      desk: (o) => desk(dims(o)),
      wall: (o) => wall(dims(o)),
      corkBoard: (o) => corkBoard(dims(o)),
      deskLamp: (o) => deskLamp(dims(o)),
      mug: (o) => mug(dims(o)),
      floppy: (o) => floppy(dims(o)),
    },
    plan: SCREEN,
    motion: SCREEN,
    sfx: spec.sfx,
  };
}
