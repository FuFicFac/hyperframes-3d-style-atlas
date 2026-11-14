// styles/domino-run/style.js — "Domino Run": a domino rally on a polished wooden floor, low and close, warm daylight.
// The look lives in spec.js; the chain reaction lives in rally.js (THREE-free planner, shared with SCORE and the camera).
// This file turns a solved plan into pictures: one InstancedMesh for every tile (per-instance front / back colours,
// fall angles from plan.anglesAt(t)), stair blocks and plank bridges, the ball, flag and banner gadgets, a blurred
// mirror wood floor (kit reflectiveSweep) and a caption chip on the overlay. Props never animate themselves: the scene
// calls rally.update(t) (or each prop's userData.update(t)) from renderAt.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { paintPixels, canvasTexture, makeCanvas } from "../../kit/textures.js";
import { reflectiveSweep } from "../../kit/studio.js";
import { screenCanvas } from "../../kit/overlay.js";
import { spring, ease, clamp } from "../../kit/time.js";
import * as rally from "./rally.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ"), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const TL = spec.tile;

  // ---------------------------------------------------------------- floor: blurred mirror over honey planks
  /** floor({ size }) -> reflective wood floor. userData.reflect(center [x, z]) renders the mirror pass (call each frame). */
  function floor(o = {}) {
    const size = o.size ?? 50;
    const m = reflectiveSweep(stage, materials.floor, {
      width: size, depth: size, height: 0.02, radius: 0.01, strength: 0.42, facing: 0.14, blur: 2.6, fade: [3.5, 10], envIntensity: 0.25, specular: 0.5, resolution: 0.5,
    });
    m.name = "floor";
    m.userData.reflect = (center) => {
      m.userData.uniforms.uCenter.value.set(center[0], center[1]);
      m.userData.renderReflection(stage.renderer, stage.scene, stage.camera);
    };
    return m;
  }

  // ---------------------------------------------------------------- tiles
  const tileGeo = (() => {
    const g = new RoundedBoxGeometry(TL.W, TL.H, TL.T, 3, TL.radius);
    g.translate(0, TL.H / 2, -TL.T / 2);                 // pivot = front bottom edge; local +z = fall direction
    const nz = g.attributes.normal, face = new Float32Array(nz.count);
    for (let i = 0; i < nz.count; i++) face[i] = nz.getZ(i) < -0.55 ? 1 : 0;   // back face (and its rounded rim)
    g.setAttribute("aFace", new THREE.BufferAttribute(face, 1));
    return g;
  })();
  function tileMaterial() {
    const mat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: TL.roughness, clearcoat: TL.clearcoat, clearcoatRoughness: TL.clearcoatRoughness, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec3 aFront; attribute vec3 aBack; attribute float aFace; varying vec3 vTile;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTile = mix(aFront, aBack, aFace);");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vTile;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vTile;");
    };
    mat.customProgramCacheKey = () => "domino-run-tile";
    mat.name = "tile";
    return mat;
  }
  const lin = (hex) => new THREE.Color(hex);              // colour management: sRGB hex -> linear working space

  /** tiles(plan) -> InstancedMesh of every planned tile; userData.update(t) poses them from plan.anglesAt(t). */
  function tiles(plan) {
    const n = plan.count;
    const geo = tileGeo.clone();
    const fr = new Float32Array(n * 3), bk = new Float32Array(n * 3);
    plan.tiles.forEach((t, i) => { lin(t.front).toArray(fr, i * 3); lin(t.back).toArray(bk, i * 3); });
    geo.setAttribute("aFront", new THREE.InstancedBufferAttribute(fr, 3));
    geo.setAttribute("aBack", new THREE.InstancedBufferAttribute(bk, 3));
    const mesh = new THREE.InstancedMesh(geo, tileMaterial(), n);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = "tiles";
    const A = new Float32Array(n);
    mesh.userData.angles = A;
    mesh.userData.update = (t) => {
      plan.anglesAt(t, A);
      for (let i = 0; i < n; i++) {
        const ti = plan.tiles[i];
        _e.set(A[i], ti.yaw, 0, "YXZ");
        _q.setFromEuler(_e);
        _p.set(ti.p[0], ti.p[1], ti.p[2]);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    mesh.userData.update(0);
    return mesh;
  }

  /** tile({ front, back }) -> one standing tile mesh (pivot at its front bottom edge); userData.setAngle(rad). */
  function tile(o = {}) {
    const geo = tileGeo.clone();
    geo.setAttribute("aFront", new THREE.InstancedBufferAttribute(new Float32Array(lin(o.front ?? P.red).toArray()), 3));
    geo.setAttribute("aBack", new THREE.InstancedBufferAttribute(new Float32Array(lin(o.back ?? o.front ?? P.red).toArray()), 3));
    const mesh = new THREE.InstancedMesh(geo, tileMaterial(), 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.setAngle = (a) => { mesh.setMatrixAt(0, _m.makeRotationX(a)); mesh.instanceMatrix.needsUpdate = true; };
    return mesh;
  }

  // ---------------------------------------------------------------- stairs and bridges (from plan.blocks)
  const box = (w, h, l, mat, r = 0.008) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, l, 2, Math.min(r, h / 2.2, w / 2.2, l / 2.2)), mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  /** blocks(plan) -> Group of beech step blocks and plank bridges (deck + two piers) under the raised tiles. */
  function blocks(plan) {
    const g = new THREE.Group();
    g.name = "stairs";
    for (const b of plan.blocks) {
      const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const node = new THREE.Group();
      node.position.set((b.a[0] + b.b[0]) / 2, 0, (b.a[1] + b.b[1]) / 2);
      node.rotation.y = yaw;
      if (b.kind === "bridge") {
        const deck = box(b.w + 0.06, b.deckT, L, materials.plank, 0.01);
        deck.position.y = b.h - b.deckT / 2;
        node.add(deck);
        for (const s of [-1, 1]) {
          const pier = box(b.w, b.h - b.deckT, b.pier, materials.block);
          pier.position.set(0, (b.h - b.deckT) / 2, s * (L / 2 - b.pier / 2));
          node.add(pier);
        }
      } else {
        const m = box(b.w, b.h, L, materials.block);
        m.position.y = b.h / 2;
        node.add(m);
      }
      g.add(node);
    }
    return g;
  }

  // ---------------------------------------------------------------- gadgets
  /** ball(B) -> glossy two-tone ball; userData.update(t, plan) rolls it along the planned straight line. */
  function ball(B, plan) {
    const tex = canvasTexture(paintPixels([256, 128], (u, v) => {
      const band = Math.abs(v - 0.5) < 0.09;
      const c = band ? new THREE.Color(P.cream) : new THREE.Color(B.color ?? spec.ball.color);
      return [c.r, c.g, c.b];
    }), { anisotropy: 4 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(B.r, 48, 24), new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: tex, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.06 }));
    m.castShadow = m.receiveShadow = true;
    m.name = B.id;
    const axis = new THREE.Vector3(B.dir[1], 0, -B.dir[0]).normalize();
    const base = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(B.dir[0], B.dir[1]));
    m.userData.update = (t) => {
      const s = plan.ballAt(B, t);
      m.position.set(...s.p);
      m.quaternion.setFromAxisAngle(axis, s.roll).multiply(base);
    };
    m.userData.update(0);
    return m;
  }

  /** flag(G) -> brass base, cream pole, red pennant; lies flat until G.t, then springs upright (closed-form spring). */
  function flag(G) {
    const F = spec.flag;
    const root = new THREE.Group();
    root.name = G.id;
    root.position.set(G.at[0], 0, G.at[1]);
    root.rotation.y = G.yaw ?? 0;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 32), materials.brass);
    base.position.y = 0.015; base.castShadow = base.receiveShadow = true;
    root.add(base);
    const hinge = new THREE.Group();
    hinge.position.y = 0.03;
    root.add(hinge);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, F.pole, 16), materials.pole);
    pole.position.y = F.pole / 2; pole.castShadow = true;
    hinge.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), materials.brass);
    knob.position.y = F.pole; hinge.add(knob);
    const clothGeo = new THREE.PlaneGeometry(F.w, F.h, 12, 2);
    clothGeo.translate(F.w / 2, -F.h / 2, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: F.color, roughness: 0.75, side: THREE.DoubleSide }));
    cloth.position.set(0.012, F.pole - 0.02, 0);
    cloth.rotation.y = -Math.PI / 2;                       // pennant streams sideways across the fall line
    cloth.castShadow = true;
    hinge.add(cloth);
    const pos = clothGeo.attributes.position, rest = pos.array.slice();
    root.userData.update = (t) => {
      const tau = t - G.t;
      const u = tau > 0 ? spring(tau, F.spring) : 0;
      hinge.rotation.x = (1 - u) * (Math.PI / 2);          // lying flat, pointing forward, before the pop
      // a gentle travelling ripple once up (rewritten from rest each call)
      const amp = tau > 0 ? 0.03 * Math.min(1, tau / 0.4) : 0;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        pos.array[i * 3 + 2] = rest[i * 3 + 2] + amp * (x / F.w) * Math.sin(x * 14 - t * 7);
      }
      pos.needsUpdate = true;
      clothGeo.computeVertexNormals();
    };
    root.userData.update(0);
    return root;
  }

  function bannerTexture() {
    const B = spec.banner, c = makeCanvas(1024, 280), x = c.getContext("2d");
    x.fillStyle = P.cream; x.fillRect(0, 0, 1024, 280);
    const cols = B.colors.slice(1), n = 13, w = 1024 / n;
    for (let i = 0; i < n; i++) {                            // a row of standing "tiles" in the rally colours
      x.fillStyle = cols[i % cols.length];
      const h = 150, y = 70;
      x.beginPath(); x.roundRect(i * w + w * 0.22, y, w * 0.56, h, 10); x.fill();
    }
    x.fillStyle = P.ink; x.fillRect(0, 0, 1024, 18); x.fillRect(0, 262, 1024, 18);
    return canvasTexture(c, { anisotropy: 8 });
  }
  /** banner(G) -> two posts, a brass bar and a cloth that unrolls downward at G.t (outBounce). */
  function banner(G) {
    const B = spec.banner;
    const root = new THREE.Group();
    root.name = G.id;
    root.position.set(G.at[0], 0, G.at[1]);
    root.rotation.y = G.yaw ?? 0;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, B.top + 0.12, 16), materials.pole);
      post.position.set(s * (B.w / 2 + 0.06), (B.top + 0.12) / 2, 0); post.castShadow = true;
      root.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 24), materials.brass);
      foot.position.set(s * (B.w / 2 + 0.06), 0.015, 0); foot.castShadow = foot.receiveShadow = true;
      root.add(foot);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, B.w + 0.2, 16), materials.brass);
    bar.rotation.z = Math.PI / 2; bar.position.y = B.top; root.add(bar);
    const tex = bannerTexture();
    const geo = new THREE.PlaneGeometry(B.w, B.h);
    geo.translate(0, -B.h / 2, 0);
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    cloth.position.y = B.top - 0.02; cloth.castShadow = true;
    root.add(cloth);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, B.w + 0.04, 20), new THREE.MeshStandardMaterial({ color: P.ink, roughness: 0.5 }));
    roll.rotation.z = Math.PI / 2; roll.castShadow = true; root.add(roll);
    root.userData.update = (t) => {
      const u = Math.max(0.02, ease.outBounce(clamp((t - G.t) / B.drop)));
      cloth.scale.y = u;
      tex.repeat.set(1, u); tex.offset.set(0, 1 - u);   // show the TOP of the artwork as it unrolls (uv transform only)
      roll.position.y = B.top - 0.02 - B.h * u;
    };
    root.userData.update(0);
    return root;
  }

  // ---------------------------------------------------------------- caption chip (overlay: exact colours)
  /** caption() -> overlay chip; userData.show(text, alpha). One per scene, fixed position (spec.caption). */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 26;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap * 1.3}px ${Q.font}`;
      const tw = x.measureText(st.text).width;
      const chipW = Q.h * 0.36, pad = Q.cap * 0.75;
      const pw = Math.min(W - 16, pad + chipW + pad * 0.8 + tw + pad), ph = Q.h, ox = 6, oy = 6;
      x.fillStyle = "rgba(20,12,6,0.35)"; x.beginPath(); x.roundRect(ox + 2, oy + 6, pw, ph, ph / 2); x.fill();
      x.fillStyle = Q.paper; x.beginPath(); x.roundRect(ox, oy, pw, ph, ph / 2); x.fill();
      // a tiny standing domino: two-tone chip
      const cx = ox + pad, cy = oy + ph * 0.18, chH = ph * 0.64;
      x.fillStyle = Q.chip[0]; x.beginPath(); x.roundRect(cx, cy, chipW, chH, 5); x.fill();
      x.fillStyle = Q.chip[1]; x.beginPath(); x.roundRect(cx, cy + chH / 2, chipW, chH / 2, [0, 0, 5, 5]); x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, cx + chipW + pad * 0.8, oy + ph / 2 + 2);
    }, { upload: true });
    mesh.userData.place(Q.x, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * rally(plan, { floor = true }) -> { group, floor, tiles, blocks, balls, gadgets, update(t), reflect(center) }
   *   update(t) poses tiles, balls and gadgets; reflect([x, z]) moves the sun's shadow box + mirror centre there and
   *   renders the floor mirror (call after the camera moved, right before stage.render).
   */
  function rallyProps(plan, o = {}) {
    const group = new THREE.Group();
    group.name = "rally";
    const fl = o.floor === false ? null : floor();
    if (fl) stage.scene.add(fl);
    const tm = tiles(plan);
    group.add(tm);
    const bl = blocks(plan);
    group.add(bl);
    const bs = plan.balls.map((B) => { const m = ball(B, plan); group.add(m); return m; });
    const gs = plan.gadgets.map((G) => { const m = G.kind === "flag" ? flag(G) : banner(G); group.add(m); return m; });
    stage.scene.add(group);
    const sun = lights.sun, sunOff = new THREE.Vector3(...spec.lights.find((l) => l.id === "sun").position);
    return {
      group, floor: fl, tiles: tm, blocks: bl, balls: bs, gadgets: gs,
      update(t) { tm.userData.update(t); bs.forEach((b) => b.userData.update(t)); gs.forEach((g) => g.userData.update(t)); },
      reflect(center) {
        if (sun) {
          sun.position.set(center[0] + sunOff.x, sunOff.y, center[1] + sunOff.z);
          sun.target.position.set(center[0], 0, center[1]);
          sun.target.updateMatrixWorld();
        }
        if (fl) fl.userData.reflect(center);
      },
    };
  }

  const props = { floor, tile, tiles, blocks, ball, flag, banner, caption, rally: rallyProps };
  const factories = {};
  return {
    spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories, sfx: spec.sfx,
    plan: rally, motion: rally,
  };
}
