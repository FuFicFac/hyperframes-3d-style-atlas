// styles/slit-scan/style.js — "Slit-Scan": time-displacement photography of a bright toy bench.
// Props: bench() (wall, floor, posts, the spinning four-colour beam, the bobbing beaded rod, a row of metronomes — all
// posed from ONE world time by bench.pose(w)), timeCamera(bench) (the stateless multi-pass: K+1 scissored renders of the
// same scene at K+1 world times into two ping-pong targets, composited by one shader that also draws the scan line and
// the then/now ruler) and ui() (caption plates, ruler end labels, the delay knob — overlay, exact colours).
// Nothing keeps frame history: every frame re-renders every slice from t. Props never animate themselves.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { getOverlay, pinToScreen } from "../../kit/overlay.js";
import { clamp } from "../../kit/time.js";
import * as timeslice from "./timeslice.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/** createStyle(stage, opts?) -> style */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const col = (name) => new THREE.Color(P[name] ?? name);

  /** paint a geometry one flat colour (vertex colours; the toy material multiplies them) */
  const tint = (geo, name) => {
    const c = col(name), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return geo;
  };
  const at = (geo, x, y, z) => geo.translate(x, y, z);
  const toyMesh = (geos, name) => {
    const m = new THREE.Mesh(mergeGeometries(geos), materials.toy);
    m.name = name; m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  // ---------------------------------------------------------------- the bench (all subjects)
  /**
   * bench(T = spec.toys) -> { group, toys, pose(w), parts } (adds itself to the scene)
   *   pose(w): put every moving part at WORLD time w (closed form). The time camera calls it once per slice.
   */
  function bench(T = spec.toys) {
    const toys = timeslice.createToys(T);
    const group = new THREE.Group(); group.name = "bench";
    // set: wall + floor
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 24), materials.wall);
    wall.position.set(0, 8, T.wallZ); wall.receiveShadow = true; wall.name = "wall";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, T.wallZ + 15); floor.receiveShadow = true; floor.name = "floor";
    group.add(wall, floor);

    // static frame: two posts with feet, beam hubs, metronome bodies
    const B = T.beam, R = T.rod, M = T.metronome;
    const stat = [];
    for (const s of [-1, 1]) {
      stat.push(tint(at(new THREE.BoxGeometry(T.postW, T.postH, T.postD), s * T.postX, T.postH / 2, 0), "cream"));
      stat.push(tint(at(new THREE.BoxGeometry(T.postW + 0.5, 0.16, T.postD + 0.5), s * T.postX, 0.08, 0), "steel"));
      stat.push(tint(at(new THREE.BoxGeometry(T.postW + 0.12, 0.14, T.postD + 0.12), s * T.postX, T.postH + 0.07, 0), "steel"));
      // slot the rod rides in
      stat.push(tint(at(new THREE.BoxGeometry(T.postW + 0.02, R.amp * 2 + 0.5, 0.16), s * T.postX, R.y, T.postD / 2 - 0.07), "ink"));
      const hub = new THREE.CylinderGeometry(B.hubR, B.hubR, B.hubW, 40); hub.rotateZ(Math.PI / 2);
      stat.push(tint(at(hub, s * (B.length / 2 + B.hubW / 2), B.y, 0), "ink"));
    }
    const mx = toys.metX();
    for (const x of mx) {
      const body = new THREE.CylinderGeometry(0.1, 0.34, 0.62, 4); body.rotateY(Math.PI / 4);
      stat.push(tint(at(body, x, 0.31, M.z), "ink"));
      const pin = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16); pin.rotateX(Math.PI / 2);
      stat.push(tint(at(pin, x, M.pivotY + 0.1, M.z + 0.22), "cream"));
    }
    group.add(toyMesh(stat, "frame"));

    // beam: one box, four face colours (+y, -y, +z, -z); it turns about its long (x) axis
    const bg = new THREE.BoxGeometry(B.length, B.size, B.size);
    {
      const faces = ["steel", "steel", B.colors[0], B.colors[2], B.colors[1], B.colors[3]]; // +x -x +y -y +z -z
      const a = new Float32Array(24 * 3);
      for (let f = 0; f < 6; f++) { const c = col(faces[f]); for (let v = 0; v < 4; v++) a.set([c.r, c.g, c.b], (f * 4 + v) * 3); }
      bg.setAttribute("color", new THREE.BufferAttribute(a, 3));
    }
    const beam = new THREE.Mesh(bg, materials.toy);
    beam.name = "beam"; beam.position.set(0, B.y, 0); beam.castShadow = beam.receiveShadow = true;
    group.add(beam);

    // rod: a straight bar with beads + two sliders; it bobs up and down as one rigid piece
    const rg = [];
    const bar = new THREE.CylinderGeometry(R.radius, R.radius, R.length, 16); bar.rotateZ(Math.PI / 2);
    rg.push(tint(bar, "ink"));
    for (let i = 0; i < R.beads; i++) {
      const x = -R.beadSpan / 2 + (R.beadSpan * i) / (R.beads - 1);
      rg.push(tint(at(new THREE.SphereGeometry(R.beadR, 28, 18), x, 0, 0), R.colors[i % R.colors.length]));
    }
    for (const s of [-1, 1]) rg.push(tint(at(new THREE.BoxGeometry(0.2, 0.34, T.postD + 0.2), s * (T.postX - T.postW / 2 - 0.1), 0, 0), "steel"));
    const rod = toyMesh(rg, "rod");
    group.add(rod);

    // metronome arms: thin arm + bob, pivoting in the screen plane; all in unison in world time
    const arms = mx.map((x, i) => {
      const g = [
        tint(at(new THREE.BoxGeometry(0.06, M.arm, 0.05), 0, M.arm / 2 - 0.1, 0), "steel"),
        tint(at(new THREE.SphereGeometry(M.bob, 24, 16), 0, M.arm * M.bobAt, 0), M.colors[i % M.colors.length]),
      ];
      const arm = toyMesh(g, `arm${i}`);
      arm.position.set(x, M.pivotY + 0.1, M.z + 0.26);
      group.add(arm);
      return arm;
    });

    stage.scene.add(group);
    const pose = (w) => {
      beam.rotation.x = toys.beamAngle(w);
      rod.position.y = toys.rodY(w);
      const a = toys.metAngle(w);
      for (const arm of arms) arm.rotation.z = -a;
    };
    pose(0);
    return { group, toys, pose, parts: { beam, rod, arms, wall, floor }, metX: mx };
  }

  // ---------------------------------------------------------------- the time camera (stateless multi-pass)
  /**
   * timeCamera(bench, o?) -> cam   (installs itself as stage.post, so stage.render(t) draws through it, then the overlay)
   *   cam.set(map, t): read the plan for video time t (slice lags, scan line, dial). Call every frame before stage.render.
   *   Per frame: node j (x = j / K) is the whole scene posed at w = t - lag_j, rendered with a scissor two strips wide
   *   into target A (even j) or B (odd j); the composite linearly blends the two nodes around each pixel, so the time
   *   map is piecewise-linear in x with no strip seams. Slices are 2x supersampled; output is sRGB, no tone mapping.
   *   Scissor state lives on the render targets (three reads renderTarget.scissor); the canvas scissor is never touched.
   */
  function timeCamera(bn, o = {}) {
    const Q = { ...spec.slices, ...o }, RU = spec.ruler;
    const K = Q.count, SS = Q.supersample;
    const W = stage.width * SS, H = stage.height * SS, sw = W / K;
    if (sw !== Math.round(sw) || sw % SS) console.warn(`[atlas] slit-scan: slices.count ${K} does not divide the frame into whole pixels`);
    const mk = () => {
      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
      rt.scissorTest = true;
      return rt;
    };
    const targets = [mk(), mk()];
    const lags = new Float32Array(K + 1);
    const U = {
      tA: { value: targets[0].texture }, tB: { value: targets[1].texture },
      uK: { value: K }, uLag: { value: lags }, uRes: { value: new THREE.Vector2(stage.width, stage.height) },
      uScanX: { value: 0 }, uScanA: { value: 0 }, uScanCol: { value: col("scan") },
      uScan: { value: new THREE.Vector4(Q.scan.core, Q.scan.halo, Q.scan.coreGain, Q.scan.haloGain) },
      uRuler: { value: new THREE.Vector4(RU.x0, RU.y0, RU.x1, RU.y1) }, uRulerR: { value: RU.radius },
      uTickStep: { value: RU.tickStep }, uLagMax: { value: RU.lagMax },
      uThen: { value: col("then") }, uNow: { value: col("now") }, uEdge: { value: new THREE.Color(RU.edge) },
      uVig: { value: Q.vignette },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform sampler2D tA; uniform sampler2D tB; uniform float uK; uniform float uLag[${K + 1}]; uniform vec2 uRes;
        uniform float uScanX; uniform float uScanA; uniform vec3 uScanCol; uniform vec4 uScan;
        uniform vec4 uRuler; uniform float uRulerR; uniform float uTickStep; uniform float uLagMax;
        uniform vec3 uThen; uniform vec3 uNow; uniform vec3 uEdge; uniform float uVig;
        varying vec2 vUv;
        float rbox(vec2 p, vec2 c, vec2 h, float r){ vec2 q = abs(p - c) - h + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        void main(){
          // --- the time map: blend the two slice nodes around this column (A holds even nodes, B odd nodes)
          float s = clamp(vUv.x, 0.0, 1.0) * uK;
          float i = min(floor(s), uK - 1.0), f = s - i;
          vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb;
          float even = 1.0 - mod(i, 2.0);
          vec3 c = mix(mix(b, a, even), mix(a, b, even), f);
          int ii = int(i);
          float l0 = uLag[ii], l1 = uLag[ii + 1], lag = mix(l0, l1, f);
          float slope = abs(l1 - l0) * uK / uRes.x;                    // seconds of lag per output pixel
          vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          c *= 1.0 - uVig * smoothstep(0.55, 1.05, length(q));
          // --- scan line (additive glow)
          float d = (vUv.x - uScanX) * uRes.x;
          c += uScanCol * uScanA * (uScan.z * exp(-d * d / (2.0 * uScan.x * uScan.x)) + uScan.w * exp(-abs(d) / uScan.y));
          // --- ruler: which moment each column shows (colour = lag; ticks = iso-time lines every uTickStep seconds)
          vec2 p = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
          vec2 rc = 0.5 * (uRuler.xy + uRuler.zw), rh = 0.5 * (uRuler.zw - uRuler.xy);
          float sd = rbox(p, rc, rh, uRulerR);
          vec3 rcol = mix(uNow, uThen, clamp(lag / uLagMax, 0.0, 1.0));
          float tq = lag / uTickStep;
          float dpx = abs(fract(tq + 0.5) - 0.5) * uTickStep / max(slope, 1e-6);
          float tick = (1.0 - smoothstep(1.2, 2.6, dpx)) * smoothstep(0.00004, 0.0002, slope) * step(abs(p.y - rc.y), rh.y * 0.62);
          rcol = mix(rcol, uEdge, tick * 0.85);
          rcol = mix(rcol, uEdge, smoothstep(-5.0, -3.5, sd));         // dark outline
          c = mix(c, c * 0.72, (1.0 - smoothstep(0.0, 9.0, sd - 1.0)) * step(0.0, sd) * 0.6); // soft drop shadow
          c = mix(c, rcol, 1.0 - smoothstep(-0.75, 0.75, sd));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const cScene = new THREE.Scene(); cScene.add(quad);
    const cCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const state = { t: 0 };
    const renderer = stage.renderer;

    const cam = {
      K, targets, uniforms: U, passes: {}, composer: null,
      set(map, t) {
        state.t = t;
        map.nodes(t, K, lags);
        const sc = map.scan(t);
        U.uScanX.value = sc.x; U.uScanA.value = sc.level;
      },
      /** stage.post.set(...) compatibility: live-tune the look ({ vignette }) */
      setLook(e = {}) { if (e.vignette != null) U.uVig.value = e.vignette; },
      render(t = state.t) {
        const scene = stage.scene, camera = stage.camera;
        const autoClear = renderer.autoClear;
        renderer.autoClear = true;
        for (let j = 0; j <= K; j++) {
          bn.pose(t - lags[j]);
          const rt = targets[j & 1];
          const x0 = Math.max(0, (j - 1) * sw), x1 = Math.min(W, (j + 1) * sw);
          rt.scissor.set(x0, 0, x1 - x0, H);
          rt.viewport.set(0, 0, W, H);
          renderer.setRenderTarget(rt);
          renderer.render(scene, camera);
        }
        bn.pose(t); // leave the scene at "now" (what a plain scene render — e.g. the HDR self-check — sees)
        renderer.setRenderTarget(null);
        renderer.render(cScene, cCam);
        renderer.autoClear = autoClear;
      },
    };
    cam.set = cam.set.bind(cam);
    stage.post = cam;
    return cam;
  }

  // ---------------------------------------------------------------- overlay UI
  /**
   * ui(labels [{ text, on, off }]) -> { update(t, map) }: one caption plate at a time (top centre), THEN / NOW ruler
   * end labels that follow the profile weights, and the delay knob whose pointer follows map.delay(t).
   */
  function ui(labels = []) {
    const ov = getOverlay(stage), CP = spec.caption, RU = spec.ruler, KN = spec.knob;
    const nx = (px) => (px / stage.width) * 2 - 1, ny = (py) => 1 - (py / stage.height) * 2;
    const caps = labels.map((L) => {
      const m = createTextLabel(L.text, { height: 1, fontSize: 104, font: textStyle.font, weight: 800, color: CP.ink, background: CP.plate, radius: CP.radius, padding: 0.42, depthWrite: false });
      m.material.depthTest = false; m.renderOrder = 20;
      pinToScreen(stage, m, { x: 0, y: CP.y, height: CP.height });
      m.visible = false;
      return { m, L };
    });
    const small = (text, x, color = "#ffffff") => {
      const m = createTextLabel(text, { height: 1, fontSize: 72, font: textStyle.font, weight: 800, color, padding: 0.2, depthWrite: false, letterSpacing: 4 });
      m.material.depthTest = false; m.renderOrder = 21;
      pinToScreen(stage, m, { x: nx(x), y: ny((RU.y0 + RU.y1) / 2 + 1), height: 0.026 });
      return m;
    };
    const thenL = small("THEN", RU.x0 + 70), thenR = small("THEN", RU.x1 - 70), nowR = small("NOW", RU.x1 - 62, P.ink), nowC = small("NOW", (RU.x0 + RU.x1) / 2, P.ink);
    const dl = small("DELAY", KN.labelX, P.ink);
    // knob (overlay units: 1 = half the frame height)
    const u = (px) => (px / stage.height) * 2;
    const knob = new THREE.Group();
    const flat = (geo, color, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true })); m.renderOrder = 22 + z; return m; };
    knob.add(flat(new THREE.CircleGeometry(u(KN.r + 5), 64), KN.ring, 0));
    knob.add(flat(new THREE.CircleGeometry(u(KN.r), 64), KN.face, 1));
    for (let k = 0; k <= 10; k++) { // scale marks around the dial
      const a = THREE.MathUtils.degToRad(225 - 27 * k);
      const tk = flat(new THREE.PlaneGeometry(u(k % 5 ? 3 : 5), u(k % 5 ? 7 : 11)), KN.ring, 2);
      tk.position.set(Math.cos(a) * u(KN.r - 8), Math.sin(a) * u(KN.r - 8), 0); tk.rotation.z = a - Math.PI / 2;
      knob.add(tk);
    }
    const pointer = new THREE.Group();
    const needle = flat(new THREE.PlaneGeometry(u(KN.r - 14), u(9)), KN.pointer, 3); needle.position.x = u(KN.r - 14) / 2;
    pointer.add(needle, flat(new THREE.CircleGeometry(u(9), 32), KN.ring, 4));
    knob.add(pointer);
    knob.position.set(nx(KN.x) * ov.aspect, ny(KN.y), 0);
    ov.add(knob);

    const fade = (t, on, off) => clamp((t - on) / 0.3, 0, 1) * clamp((off - t) / 0.3, 0, 1);
    return {
      knob, captions: caps.map((c) => c.m),
      update(t, map) {
        for (const { m, L } of caps) { const a = fade(t, L.on, L.off); m.material.opacity = a; m.visible = a > 0.003; }
        const w = map.weights(t), cw = w.centre ?? 0;
        const set = (m, a) => { m.material.opacity = a; m.visible = a > 0.003; };
        set(thenL, 1); set(nowR, 1 - cw); set(thenR, cw); set(nowC, cw); set(dl, 1);
        pointer.rotation.z = THREE.MathUtils.degToRad(225 - 270 * clamp(map.delay(t) / KN.max, 0, 1));
      },
    };
  }

  return {
    spec, palette: P, materials, lights, post: null, textStyle, camera: spec.camera, sfx: spec.sfx,
    props: { bench, timeCamera, ui, label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }) },
    factories: {},
    plan: timeslice, motion: timeslice,
  };
}
