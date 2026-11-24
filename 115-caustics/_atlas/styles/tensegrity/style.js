// styles/tensegrity/style.js — "Tensegrity": a tower of pale wooden struts held only by red cords on a bright studio
// table, with a brass weight and a pair of snips waiting at the side. The look lives in spec.js; WHERE every node is, HOW
// hard every cord pulls, WHEN things move and what touches lives in tower.js (THREE-free planner shared with SCORE).
// This file turns a plan into pictures: table, struts (+ brass end caps), ONE InstancedMesh of cord segments (straight
// when taut, sagging when slack; glow by tension), the cut ends, contact glints, the weight on its spider, the snips and
// an overlay caption plate. Props never animate themselves: the scene calls update(t), and every update assigns from t.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { createGround } from "../../kit/builders.js";
import { screenCanvas } from "../../kit/overlay.js";
import { woodTexture } from "../../kit/textures.js";
import { clamp, smoothstep, TAU } from "../../kit/time.js";
import * as tower from "./tower.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const P = spec.palette, TW = spec.tower;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const Y = new THREE.Vector3(0, 1, 0);

  // pale wood along the strut: the kit texture's grain runs along U, so turn it a quarter for the cylinder's V axis
  const W = spec.wood;
  materials.wood.map = woodTexture({ size: 512, boards: W.boards, seed: W.seed, dark: W.dark, mid: W.mid, light: W.light, seam: W.seam, contrast: W.contrast, grainFreq: W.grainFreq, repeat: [1, 0.35] });
  materials.wood.map.center.set(0.5, 0.5); materials.wood.map.rotation = Math.PI / 2;
  materials.wood.needsUpdate = true;

  /**
   * glowMaterial(power, uniform?, additive = true) -> soft-glow material: strength = colour x |N.V|^power, so a sleeve or
   *   ball is strongest along its middle and fades to nothing at its silhouette. Per-instance colour (instanceColor) unless
   *   `uniform` (then uniforms.uColor). Black = invisible. additive = light added (flares); false = a tinted alpha haze
   *   (hue = colour / max, alpha = max), which still reads over the white table. Instancing applied by hand (trap §5).
   */
  function glowMaterial(power, uniform = false, additive = true) {
    const defines = {};
    if (uniform) defines.UNIFORM_COLOR = 1;
    if (!additive) defines.ALPHA_GLOW = 1;
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color("#ffffff") }, uPower: { value: power } },
      defines,
      vertexShader: `
        varying vec3 vCol; varying float vF;
        uniform vec3 uColor;
        void main() {
          vec4 p = vec4(position, 1.0);
          vec3 n = normal;
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
            n = mat3(instanceMatrix) * n;
          #endif
          vec4 mv = modelViewMatrix * p;
          vec3 nv = normalize(normalMatrix * n + vec3(1e-6));
          vF = abs(dot(nv, normalize(-mv.xyz + vec3(1e-6))));
          #if defined(USE_INSTANCING_COLOR) && !defined(UNIFORM_COLOR)
            vCol = instanceColor;
          #else
            vCol = uColor;
          #endif
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vCol; varying float vF;
        uniform float uPower;
        void main() {
          float f = pow(clamp(vF, 0.0, 1.0), uPower);
          #ifdef ALPHA_GLOW
            // a tinted haze that also shows on a white table: hue = colour / max, alpha = max x falloff
            float m = max(vCol.r, max(vCol.g, vCol.b));
            gl_FragColor = vec4(vCol / max(m, 1e-4), clamp(m, 0.0, 1.0) * f);
          #else
            gl_FragColor = vec4(vCol * f, 1.0);
          #endif
        }`,
      transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false,
    });
  }

  // ---------------------------------------------------------------- table
  /** table() -> the bright studio table top (a big ground plane; the sky gradient is the sweep behind it) */
  function table() {
    const g = createGround({ size: 120, material: materials.table });
    g.name = "table";
    return g;
  }

  // ---------------------------------------------------------------- the tower
  /**
   * towerProp(plan) -> Group with userData.update(t): struts, end caps, cords (glow by tension, sag when slack),
   *   the two cut ends after the cut, and a glint where struts touch.
   */
  function towerProp(plan) {
    const g = new THREE.Group(); g.name = "tower";
    const M = plan.model, NS = M.struts.length, NC = M.cords.length, SEG = TW.sag.segments;
    const strutGeo = new THREE.CylinderGeometry(TW.strutRadius, TW.strutRadius, 1, 20, 1);
    const struts = shadow(new THREE.InstancedMesh(strutGeo, materials.wood, NS));
    struts.name = "struts"; struts.frustumCulled = false;
    const caps = shadow(new THREE.InstancedMesh(new THREE.SphereGeometry(TW.capRadius, 20, 14), materials.brass, plan.n), true, false);
    caps.name = "caps"; caps.frustumCulled = false;
    // cords: NC slots of SEG segments + one extra slot for the second cut end
    const cordMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const cordGeo = new THREE.CylinderGeometry(TW.cordRadius, TW.cordRadius, 1, 8, 1);
    const cords = shadow(new THREE.InstancedMesh(cordGeo, cordMat, (NC + 1) * SEG), true, false);
    cords.name = "cords"; cords.frustumCulled = false;
    // the glow: an additive sleeve around every lit cord segment (its colour IS its strength; black = invisible)
    const G = TW.glow;
    const haloMat = glowMaterial(G.haloPower, false, false);
    const halo = new THREE.InstancedMesh(new THREE.CylinderGeometry(TW.cordRadius, TW.cordRadius, 1, 12, 1, true), haloMat, NC * SEG);
    halo.name = "cord-glow"; halo.frustumCulled = false; halo.renderOrder = 3;
    const dim = new THREE.Color(G.dim), litC = new THREE.Color(G.lit), hotC = new THREE.Color(G.hot), haloC = new THREE.Color(G.halo), cut = new THREE.Color(G.dim);
    const black = new THREE.Color(0, 0, 0), hc = new THREE.Color(), white = new THREE.Color(1, 1, 1), touchC = new THREE.Color(TW.contactGlow.tint);
    // contact glints: a small bright bead + halo at each contact point
    const glints = plan.contacts.map(() => {
      const m = new THREE.Group();
      const bead = new THREE.Mesh(new THREE.SphereGeometry(TW.strutRadius * 1.3, 18, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMaterial(1.6, true));
      glow.renderOrder = 4;
      m.add(bead, glow); m.userData.bead = bead; m.userData.glow = glow;
      m.visible = false; g.add(m); return m;
    });
    g.add(struts, caps, cords, halo);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qI = new THREE.Quaternion(), a = new THREE.Vector3(), b = new THREE.Vector3();
    const d = new THREE.Vector3(), sc = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const X = new Float64Array(3 * plan.n);
    const rod = (mesh, i, p0, p1, r = 1) => {
      d.subVectors(p1, p0); const len = d.length();
      if (len < 1e-6) { mesh.setMatrixAt(i, zero); return; }
      q.setFromUnitVectors(Y, d.multiplyScalar(1 / len));
      mesh.setMatrixAt(i, m4.compose(a.copy(p0).addScaledVector(d, len / 2), q, sc.set(r, len, r)));
    };
    const pts = Array.from({ length: SEG + 1 }, () => new THREE.Vector3());
    const pa = new THREE.Vector3(), pb = new THREE.Vector3();
    /** fill pts with a cord from A to B of rest length `rest`: straight when taut, a parabola-ish sag when slack */
    const cordPts = (A, B, rest) => {
      const dist = A.distanceTo(B);
      const slack = Math.max(0, rest - dist);
      const sag = Math.sqrt(Math.max(0, (3 * dist * slack) / 8));   // arc length of a shallow parabola = d + 8 s^2 / (3 d)
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        pts[k].lerpVectors(A, B, u);
        pts[k].y -= sag * 4 * u * (1 - u);
      }
    };
    const lay = (slot, colour, glowColour) => {
      for (let k = 0; k < SEG; k++) {
        rod(cords, slot * SEG + k, pts[k], pts[k + 1]);
        cords.setColorAt(slot * SEG + k, colour);
        if (slot < NC) {
          if (glowColour) rod(halo, slot * SEG + k, pts[k], pts[k + 1], G.haloRadius);
          else halo.setMatrixAt(slot * SEG + k, zero);
          halo.setColorAt(slot * SEG + k, glowColour ?? black);
        }
      }
    };
    g.userData.update = (t) => {
      plan.nodes(t, X);
      for (let i = 0; i < NS; i++) {
        // a strut keeps its exact length about the midpoint of its two (path-interpolated) end nodes
        const s = M.struts[i];
        pa.set(X[3 * s.a], X[3 * s.a + 1], X[3 * s.a + 2]); pb.set(X[3 * s.b], X[3 * s.b + 1], X[3 * s.b + 2]);
        b.addVectors(pa, pb).multiplyScalar(0.5); d.subVectors(pb, pa).normalize();
        rod(struts, i, a.copy(b).addScaledVector(d, -s.L0 / 2), pb.copy(b).addScaledVector(d, s.L0 / 2));
      }
      // struts that have come to rest on another strut warm up (the "finally touch" moment), from their first contact on
      for (let i = 0; i < NS; i++) {
        let on = 0;
        for (const ct of plan.contacts) if (ct.i === i || ct.j === i) on = Math.max(on, smoothstep(ct.t - 0.05, ct.t + 0.25, t));
        struts.setColorAt(i, c.copy(white).lerp(touchC, on));
      }
      for (let i = 0; i < plan.n; i++) caps.setMatrixAt(i, m4.compose(a.set(X[3 * i], X[3 * i + 1], X[3 * i + 2]), qI, one));
      const glow = plan.glow(t);
      const halves = plan.cutHalves(t);
      for (let k = 0; k < NC; k++) {
        const cd = M.cords[k];
        pa.set(X[3 * cd.a], X[3 * cd.a + 1], X[3 * cd.a + 2]); pb.set(X[3 * cd.b], X[3 * cd.b + 1], X[3 * cd.b + 2]);
        const gk = clamp(glow[k], 0, 2);
        c.copy(dim).lerp(litC, clamp(gk, 0, 1)).lerp(hotC, clamp((gk - 0.85) * 0.8, 0, 0.75));
        hc.copy(haloC).multiplyScalar(G.haloLevel * gk);
        if (k === plan.cut && halves) {
          // the first cut end in this cord's slot, the second in the extra slot
          const [h0, h1] = halves;
          for (const [slot, h] of [[k, h0], [NC, h1]]) {
            pa.set(...h.A); pb.set(...h.E);
            cordPts(pa, pb, pa.distanceTo(pb));
            lay(slot, cut, null);
          }
          continue;
        }
        cordPts(pa, pb, cd.rest);
        lay(k, c, gk > 0.004 ? hc : null);
      }
      if (!halves) for (let k = 0; k < SEG; k++) cords.setMatrixAt(NC * SEG + k, zero);
      plan.contacts.forEach((ct, i) => {
        const on = t >= ct.t;
        const m = glints[i];
        m.visible = on;
        if (!on) return;
        const s = t - ct.t, p = plan.contactAt(X, ct);
        const C = TW.contactGlow;
        m.position.set(p[0], p[1], p[2]);
        m.userData.glow.scale.setScalar(C.radius * (1 + C.burst * Math.exp(-s / 0.2)));
        m.userData.glow.material.uniforms.uColor.value.set(P.contact).multiplyScalar(C.level * (1 + 2 * Math.exp(-s / 0.35)));
        m.userData.bead.material.color.set(P.contact);
      });
      struts.instanceColor.needsUpdate = true;
      struts.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = cords.instanceMatrix.needsUpdate = true;
      cords.instanceColor.needsUpdate = halo.instanceMatrix.needsUpdate = halo.instanceColor.needsUpdate = true;
    };
    for (let i = 0; i < (NC + 1) * SEG; i++) cords.setColorAt(i, dim);
    for (let i = 0; i < NC * SEG; i++) halo.setColorAt(i, black);
    for (let i = 0; i < NS; i++) struts.setColorAt(i, white);
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- the brass weight on its spider
  /** weight(plan) -> Group: brass body + knob, and three spider arms that reach the top nodes once it is set down */
  function weight(plan) {
    const g = new THREE.Group(); g.name = "weight";
    const WS = TW.weight;
    const body = new THREE.Group();
    const prof = [[0, 0], [WS.radius * 0.96, 0], [WS.radius, 0.02], [WS.radius, WS.height * 0.86], [WS.radius * 0.8, WS.height], [WS.knob * 0.7, WS.height], [WS.knob * 0.6, WS.height + 0.05]];
    const knobY = WS.height + 0.05 + WS.knob * 0.8;
    const lathe = shadow(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48), materials.brass));
    const knob = shadow(new THREE.Mesh(new THREE.SphereGeometry(WS.knob, 28, 18), materials.brass));
    knob.position.y = knobY;
    const groove = new THREE.Mesh(new THREE.TorusGeometry(WS.radius * 1.002, 0.008, 8, 48), materials.steel);
    groove.rotation.x = Math.PI / 2; groove.position.y = WS.height * 0.62;
    body.add(lathe, knob, groove);
    g.add(body);
    const arms = shadow(new THREE.InstancedMesh(new THREE.CylinderGeometry(WS.arm, WS.arm, 1, 10), materials.brass, 3), true, false);
    arms.frustumCulled = false; g.add(arms);
    const up = new THREE.Vector3(), p = new THREE.Vector3(), hub = new THREE.Vector3(), tip = new THREE.Vector3(), stub = new THREE.Vector3();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3(), sc = new THREE.Vector3();
    const seatTop = plan.topFrame(plan.P1), seatHub = new THREE.Vector3(...seatTop.cen).add(new THREE.Vector3(0, WS.seat, 0));
    g.userData.update = (t) => {
      const w = plan.weight(t);
      up.set(...w.up).normalize();
      p.set(...w.pos);
      body.position.copy(p);
      body.quaternion.setFromUnitVectors(Y, up);
      hub.copy(p).addScaledVector(up, 0.01);
      // arms: short stubs while it waits / flies, reaching out to the top nodes over the last part of the flight
      // in flight the arms reach toward where the top nodes will be, carried along with the weight
      const reach = w.onTop ? 1 : smoothstep(0.7, 1, w.travel);
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * TAU + 0.4;
        stub.set(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(WS.radius * 1.35).add(p);
        stub.y = p.y + 0.012;
        if (w.onTop) tip.set(...w.arms[i]);
        else tip.set(...seatTop.pts[i]).add(p).sub(seatHub);
        tip.lerpVectors(stub, tip, reach);
        d.subVectors(tip, hub); const len = Math.max(1e-4, d.length());
        q.setFromUnitVectors(Y, d.multiplyScalar(1 / len));
        arms.setMatrixAt(i, m4.compose(hub.clone().addScaledVector(d, len / 2), q, sc.set(1, len, 1)));
      }
      arms.instanceMatrix.needsUpdate = true;
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- the snips
  /** snips(plan) -> Group: two steel blades on a brass pivot with teal grips; userData.update(t) poses and opens them */
  function snips(plan) {
    const g = new THREE.Group(); g.name = "snips";
    const SN = TW.snips, L = SN.blade, Hd = SN.handle, th = 0.022;
    const extrude = (shape, depth) => { const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 16 }); geo.translate(0, 0, -depth / 2); return geo; };
    const half = (sign) => {
      // one half in local XY: the blade runs +X from the pivot on the +sign side, its handle loop sits behind the pivot (-X)
      // on the OTHER side, as on real scissors, so opening the blades opens the handles too
      const h = new THREE.Group();
      const bs = new THREE.Shape();
      bs.moveTo(-0.02, 0); bs.lineTo(L * 0.15, sign * 0.055); bs.quadraticCurveTo(L * 0.7, sign * 0.05, L, sign * 0.004);
      bs.lineTo(L * 0.98, 0); bs.lineTo(-0.02, 0);
      const blade = shadow(new THREE.Mesh(extrude(bs, th * 0.5), materials.steel));
      blade.position.z = sign * th * 0.25;
      const cx = -Hd * 0.62, cy = -sign * 0.11, rx = Hd * 0.36, ry = 0.085;
      const ring = new THREE.Shape(); ring.absellipse(cx, cy, rx, ry, 0, TAU, false, 0);
      const hole = new THREE.Path(); hole.absellipse(cx, cy, rx * 0.62, ry * 0.5, 0, TAU, true, 0);
      ring.holes.push(hole);
      const grip = shadow(new THREE.Mesh(extrude(ring, th * 1.6), materials.grip));
      const neck = shadow(new THREE.Mesh(new THREE.BoxGeometry(Hd * 0.32, 0.035, th * 1.2), materials.grip));
      neck.position.set(-Hd * 0.17, -sign * 0.03, 0); neck.rotation.z = -sign * 0.25;
      grip.position.z = sign * th * 0.1; neck.position.z = sign * th * 0.1;
      h.add(blade, grip, neck);
      return h;
    };
    const upper = half(1), lower = half(-1);
    const pin = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, th * 2.2, 20), materials.brass));
    pin.rotation.x = Math.PI / 2;
    const body = new THREE.Group();
    body.add(upper, lower, pin);
    g.add(body);
    const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3(), basis = new THREE.Matrix4();
    const qWork = new THREE.Quaternion(), qHome = new THREE.Quaternion(), q = new THREE.Quaternion();
    {
      const s0 = plan.snips(0);
      ex.set(...s0.axis).multiplyScalar(-1);            // blades point from the pivot toward the cord
      ez.set(...s0.pivotAxis);
      ey.crossVectors(ez, ex).normalize(); ez.crossVectors(ex, ey).normalize();
      qWork.setFromRotationMatrix(basis.makeBasis(ex, ey, ez));
      // at home: lying flat on the table, blades pointing toward the tower
      const h = s0.home, toward = new THREE.Vector3(-h[0], 0, -h[2]).normalize();
      ex.copy(toward); ez.set(0, 1, 0); ey.crossVectors(ez, ex).normalize();
      qHome.setFromRotationMatrix(basis.makeBasis(ex, ey, ez));
    }
    g.userData.update = (t) => {
      const s = plan.snips(t);
      body.position.set(...s.pos);
      q.slerpQuaternions(qHome, qWork, smoothstep(0.15, 0.85, s.travel));
      body.quaternion.copy(q);
      const half = s.open / 2;
      upper.rotation.z = half; lower.rotation.z = -half;
    };
    g.userData.update(0);
    return g;
  }

  // ---------------------------------------------------------------- overlay caption plate
  /** caption() -> overlay plate (white, ink edge, a tiny strut-and-cord icon); userData.show(text, alpha) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = Q.maxW + 24, Hp = Q.h + 28;
    const mesh = screenCanvas(stage, Wp, Hp, (x, Wc, Hc, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.55), ic = Math.round(Q.h * 0.6);
      const pw = Math.min(Wc - 16, pad + ic + Math.round(pad * 0.7) + tw + pad), ph = Q.h, oy = 6, ox = 6;
      x.fillStyle = "rgba(24,34,44,0.18)"; x.beginPath(); x.roundRect(ox + 2, oy + 8, pw, ph, 22); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 22); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 4; x.beginPath(); x.roundRect(ox + 2, oy + 2, pw - 4, ph - 4, 20); x.stroke();
      // icon: two crossed struts that do not meet, tied by a red cord
      const cx = ox + pad, cy = oy + ph / 2 - ic / 2;
      x.lineCap = "round";
      x.strokeStyle = "#c9a46a"; x.lineWidth = 9;
      x.beginPath(); x.moveTo(cx + 4, cy + ic - 2); x.lineTo(cx + ic * 0.55, cy + 4); x.stroke();
      x.beginPath(); x.moveTo(cx + ic * 0.45, cy + ic - 4); x.lineTo(cx + ic - 2, cy + 6); x.stroke();
      x.strokeStyle = Q.cord; x.lineWidth = 4;
      x.beginPath(); x.moveTo(cx + 4, cy + ic - 2); x.lineTo(cx + ic * 0.45, cy + ic - 4); x.moveTo(cx + ic * 0.55, cy + 4); x.lineTo(cx + ic - 2, cy + 6);
      x.moveTo(cx + 4, cy + ic - 2); x.lineTo(cx + ic - 2, cy + 6); x.stroke();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.7), oy + Math.round(ph / 2) + 3);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - 6, Q.y);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /** rig(plan) -> { group, tower, weight, snips, update(t) } (adds itself to the scene) */
  function rig(plan) {
    const group = new THREE.Group(); group.name = "tensegrity";
    const tb = table(), tw = towerProp(plan), wt = weight(plan), sn = snips(plan);
    group.add(tb, tw, wt, sn);
    stage.scene.add(group);
    const update = (t) => { tw.userData.update(t); wt.userData.update(t); sn.userData.update(t); };
    update(0);
    return { group, table: tb, tower: tw, weight: wt, snips: sn, update };
  }

  const props = { table, tower: towerProp, weight, snips, caption, rig };
  return { spec, palette: P, materials, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx, plan: tower, motion: tower };
}
