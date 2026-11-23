// styles/percolation/style.js — "Percolation": an enamel board of glass sight-pipes and red-lever valves. The look lives
// in spec.js; WHICH valve opens WHEN and where the water is lives in percolate.js (THREE-free planner, shared with SCORE).
// This file turns a plan into pictures: one InstancedMesh per part (glass pipes, brass joints, valve bodies, collars,
// levers, water from end a, water from end b, cluster bands), two troughs, the board, a magenta highlight ring and an overlay
// caption plate. Props never animate themselves: the scene calls update(t), which rewrites every instance from t.
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { FONTS } from "../../kit/text.js";
import { screenCanvas } from "../../kit/overlay.js";
import { fresnelGlass } from "../../kit/materials.js";
import { RoundedBoxGeometry } from "../../kit/builders.js";
import { clamp, ease, smoothstep } from "../../kit/time.js";
import * as percolate from "./percolate.js";
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
  const G = spec.grid, PI = spec.pipe, p = G.pitch;
  const glass = fresnelGlass({ ...spec.glass });
  glass.name = "glass";

  /** grid units -> world metres on the board plane */
  const wx = (gx) => gx * p, wy = (gy) => gy * p;
  /** extents of the network in metres: { x, yTop, yBot } (trough outer edges) */
  const extents = () => {
    const x = ((G.W - 1) / 2) * p + spec.trough.extra;
    const y = ((G.H - 1) / 2 + 1) * p + spec.trough.h;
    return { x, yTop: y, yBot: -y };
  };

  // ---------------------------------------------------------------- the board
  /** board() -> Group: white enamel slab with a navy border band and brass rivets; front face at z = 0 */
  function board(o = {}) {
    const B = { ...spec.board, ...o };
    const E = extents();
    const w = 2 * (E.x + B.margin[0]), h = E.yTop - E.yBot + 2 * B.margin[1];
    const g = new THREE.Group(); g.name = "board";
    const slab = new THREE.Mesh(new RoundedBoxGeometry(w, h, B.depth, 4, 0.06), materials.enamel);
    slab.position.z = -B.depth / 2; slab.receiveShadow = true; slab.name = "enamel";
    g.add(slab);
    const bw = B.border, inset = 0.16;
    const parts = [[w - 2 * inset, bw, 0, h / 2 - inset - bw / 2], [w - 2 * inset, bw, 0, -h / 2 + inset + bw / 2], [bw, h - 2 * inset, -w / 2 + inset + bw / 2, 0], [bw, h - 2 * inset, w / 2 - inset - bw / 2, 0]];
    for (const [a, b, x, y] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, 0.012), materials.navy);
      m.position.set(x, y, 0.006); m.receiveShadow = true; g.add(m);
    }
    const rg = new THREE.SphereGeometry(B.rivet, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    rg.rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const r = new THREE.Mesh(rg, materials.brass);
      r.position.set(sx * (w / 2 - 0.08), sy * (h / 2 - 0.08), 0.0); r.castShadow = true; g.add(r);
    }
    g.userData.size = [w, h];
    return g;
  }

  // ---------------------------------------------------------------- troughs
  /** trough({ y, level }) -> Group: navy channel, blue water box, glass front, brass rims; userData.setLevel(0..1) */
  function trough(o = {}) {
    const T = spec.trough, E = extents();
    const L = 2 * E.x, g = new THREE.Group(); g.name = o.name ?? "trough";
    const back = new THREE.Mesh(new RoundedBoxGeometry(L, T.h, 0.06, 2, 0.02), materials.troughInside);
    back.position.z = 0.03; back.receiveShadow = true; g.add(back);
    for (const sx of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.04, T.h, T.d), materials.navy);
      end.position.set(sx * (L / 2 - 0.02), 0, T.d / 2); end.castShadow = true; g.add(end);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.03, T.d), materials.navy);
    floor.position.set(0, -T.h / 2 + 0.015, T.d / 2); g.add(floor);
    const wh = T.h - 0.06;
    const water = new THREE.Mesh(new THREE.BoxGeometry(L - 0.08, 1, T.d - 0.08), materials.water);
    water.name = "troughWater";
    g.add(water);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.08, T.h - 0.02), glass);
    front.position.set(0, 0, T.d); front.renderOrder = 2; g.add(front);
    for (const sy of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(T.rim, T.rim, L, 12), materials.brass);
      rim.rotation.z = Math.PI / 2; rim.position.set(0, sy * (T.h / 2 - 0.005), T.d); rim.castShadow = true; g.add(rim);
    }
    g.position.y = o.y ?? 0;
    g.userData.setLevel = (u) => {
      const k = clamp(u);
      water.visible = k > 0.002;
      water.scale.y = Math.max(1e-4, wh * k);
      water.position.set(0, -T.h / 2 + 0.03 + (wh * k) / 2, T.d / 2);
    };
    g.userData.setLevel(o.level ?? 1);
    return g;
  }

  // ---------------------------------------------------------------- the pipe network (all instanced)
  /**
   * network(plan) -> Group; userData.update(t) rewrites levers, water and bands from the plan.
   *   Static instances: glass pipes, brass joints, valve bodies + collars. Per frame: lever angle, water a/b, band colour.
   */
  function network(plan, o = {}) {
    const g = new THREE.Group(); g.name = "network";
    const gr = plan.grid, N = plan.N, z = PI.z;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
    // bond ends in world space (trough ends stop at the trough edge)
    const tH = spec.trough.h;
    const endPt = (gx, gy) => [wx(gx), wy(gy)];
    const ends = gr.bonds.map((b) => {
      const A = endPt(b.ax, b.ay), Bp = endPt(b.bx, b.by);
      return { A, B: Bp, mid: [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], ang: b.kind === "v" ? Math.PI / 2 : 0, len: Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) };
    });
    void tH;
    const inst = (geo, mat, count, name, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.name = name; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = true;
      g.add(m); return m;
    };
    // glass pipes (static), along +Y unit cylinder scaled to length
    const pipeGeo = new THREE.CylinderGeometry(PI.glassR, PI.glassR, 1, 14, 1, true);
    const pipes = inst(pipeGeo, glass, N, "pipes", true); // glass casts a soft pipe shadow: it helps the grid read as pipes
    pipes.renderOrder = 2;
    ends.forEach((e, i) => {
      q.setFromAxisAngle(Z, e.ang - Math.PI / 2);
      M.compose(v.set(e.mid[0], e.mid[1], z), q, s.set(1, e.len, 1));
      pipes.setMatrixAt(i, M);
    });
    // brass joints at every node
    const jointGeo = new THREE.SphereGeometry(PI.joint, 16, 10);
    const joints = inst(jointGeo, materials.brass, gr.nNodes, "joints");
    for (let n = 0; n < gr.nNodes; n++) {
      const [gx, gy] = gr.nodeXY(n);
      M.compose(v.set(wx(gx), wy(gy), z), q.identity(), s.set(1, 1, 1));
      joints.setMatrixAt(n, M);
    }
    // valve bodies (axis toward the camera) + collars (along the pipe)
    const bodyGeo = new THREE.CylinderGeometry(PI.valveR, PI.valveR, PI.valveD, 18);
    bodyGeo.rotateX(Math.PI / 2);
    const bodies = inst(bodyGeo, materials.brass, N, "valveBodies");
    const collarGeo = new THREE.CylinderGeometry(PI.collarR, PI.collarR, PI.collarL, 14);
    const collars = inst(collarGeo, materials.brass, N, "collars");
    ends.forEach((e, i) => {
      M.compose(v.set(e.mid[0], e.mid[1], z), q.identity(), s.set(1, 1, 1)); bodies.setMatrixAt(i, M);
      q.setFromAxisAngle(Z, e.ang - Math.PI / 2);
      M.compose(v.set(e.mid[0], e.mid[1], z), q, s.set(1, 1, 1)); collars.setMatrixAt(i, M);
    });
    // levers (red bars on the valve front), rotated about Z every frame
    const [lw, lh, ld] = PI.lever;
    const leverGeo = new RoundedBoxGeometry(lw, lh, ld, 2, lh * 0.45);
    const leverMat = materials.lever.clone(); leverMat.color.set("#ffffff"); // colour per instance (red; the deciding one turns magenta)
    const levers = inst(leverGeo, leverMat, N, "levers");
    const cLever = new THREE.Color(spec.materials.lever.baseColor), cHi = new THREE.Color(P.highlight), cl = new THREE.Color();
    const HI = o.highlight ?? { id: -1, level: () => 0 };
    const capGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12); capGeo.rotateX(Math.PI / 2);
    const caps = inst(capGeo, materials.brass, N, "leverCaps");
    const leverZ = z + PI.valveD / 2 + ld / 2;
    ends.forEach((e, i) => { M.compose(v.set(e.mid[0], e.mid[1], leverZ + ld / 2 + 0.006), q.identity(), s.set(1, 1, 1)); caps.setMatrixAt(i, M); });
    // water: unit cylinder from y = 0 to 1 (scaled to the filled length), one instance per pipe end
    const waterGeo = new THREE.CylinderGeometry(PI.waterR, PI.waterR, 1, 12, 1, false); waterGeo.translate(0, 0.5, 0);
    const pipeWater = materials.water.clone(); pipeWater.color.set("#ffffff"); // colour per instance (front glow -> deep blue)
    const waterA = inst(waterGeo, pipeWater, N, "waterA", false);
    const waterB = inst(waterGeo, pipeWater, N, "waterB", false);
    const cDeep = new THREE.Color(spec.materials.water.baseColor), cFront = new THREE.Color(P.waterFront).multiplyScalar(spec.front.boost), cw = new THREE.Color();
    const waterColour = (s0, d0, t) => cw.copy(cFront).lerp(cDeep, clamp((t - (s0 + d0)) / spec.front.settle));
    // cluster bands on the enamel (flat stadium shapes; opaque; tiny z offsets so crossing bands never z-fight)
    const B = spec.band, bl = p + B.width, bwid = B.width;
    const sh = new THREE.Shape(), r = bwid / 2, hl = bl / 2 - r;
    sh.moveTo(-hl, -r); sh.lineTo(hl, -r); sh.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(-hl, r); sh.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    const bandGeo = new THREE.ShapeGeometry(sh, 10);
    const bandMat = materials.band.clone();
    bandMat.polygonOffset = true; bandMat.polygonOffsetFactor = -1; bandMat.polygonOffsetUnits = -2;
    const bands = inst(bandGeo, bandMat, N, "bands", false);
    const bandZ = gr.bonds.map((b) => B.z + (b.kind === "v" ? 0.0012 : 0) + ((b.i + b.j) % 2) * 0.0006);

    const tints = P.tints.map((c) => new THREE.Color(c));
    const cPending = new THREE.Color(P.pending), cWet = new THREE.Color(P.wetBand), cBottom = new THREE.Color(P.bottom);
    /** tint index -> colour: >= 0 cluster pastel, -1 pending (joined to the wet cluster, water on its way), -2 bottom cluster */
    const tintColour = (k, out) => out.copy(k >= 0 ? tints[k % tints.length] : k === -2 ? cBottom : cPending);
    const c0 = new THREE.Color(), c1 = new THREE.Color(), cBand = new THREE.Color(), cBandFront = new THREE.Color(P.bandFront);
    const HIDE = new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5);
    const outBack = ease.outBack;

    const update = (t) => {
      for (let i = 0; i < N; i++) {
        const e = ends[i];
        // lever: across the pipe (shut) -> along it (open)
        const u = plan.valveU(i, t);
        const a = e.ang + (Math.PI / 2) * (1 - outBack(u));
        q.setFromAxisAngle(Z, a);
        const pop = 1 + PI.pop * Math.sin(Math.PI * u); // the lever swells while it turns: each click is visible
        M.compose(v.set(e.mid[0], e.mid[1], leverZ), q, s.set(pop, pop, 1));
        levers.setMatrixAt(i, M);
        const hk = i === HI.id ? HI.level(t) : 0;
        levers.setColorAt(i, cl.copy(cLever).lerp(cHi, hk));
        // water from each end
        const [fa, fb] = plan.fill(i, t);
        const dirA = v.set(e.B[0] - e.A[0], e.B[1] - e.A[1], 0).normalize();
        if (fa > 0.001) {
          q.setFromUnitVectors(Y, dirA);
          M.compose(new THREE.Vector3(e.A[0], e.A[1], z), q, s.set(1, fa * e.len, 1));
          waterA.setMatrixAt(i, M); waterA.setColorAt(i, waterColour(plan.sa[i], plan.da[i], t));
        } else waterA.setMatrixAt(i, HIDE);
        if (fb > 0.001) {
          q.setFromUnitVectors(Y, dirA.clone().negate());
          M.compose(new THREE.Vector3(e.B[0], e.B[1], z), q, s.set(1, fb * e.len, 1));
          waterB.setMatrixAt(i, M); waterB.setColorAt(i, waterColour(plan.sb[i], plan.db[i], t));
        } else waterB.setMatrixAt(i, HIDE);
        // band: none until the valve opens; then the cluster tint (cross-fading on merges); then wet blue as water fills
        const open = Math.max(smoothstep(0, 1, u * 1.6), hk); // the deciding link's band shows as soon as it is highlighted
        if (open <= 0.001) { bands.setMatrixAt(i, HIDE); bands.setColorAt(i, cWet); continue; }
        const ti = plan.tintAt(i, t, B.fade);
        tintColour(ti.from, c0); tintColour(ti.to, c1);
        if (ti.from === -1 && ti.to >= 0 && ti.u < 1 && plan.tint[i].length === 1) c0.copy(c1); // first tint: no fade from grey
        c0.lerp(c1, ti.u);
        const wet = Math.min(1, (fa + fb) * 2.5);
        // wet band: bright cyan while this pipe is filling, settling to the wet blue (same clock as the water)
        const doneAt = Math.min(Number.isFinite(plan.sa[i]) ? plan.sa[i] + plan.da[i] : Infinity, Number.isFinite(plan.sb[i]) ? plan.sb[i] + plan.db[i] : Infinity);
        cBand.copy(cBandFront).lerp(cWet, Number.isFinite(doneAt) ? clamp((t - doneAt) / spec.front.settle) : 1);
        c0.lerp(cBand, wet);
        if (hk > 0) c0.lerp(cHi, hk * 0.85); // the deciding link stays marked to the end
        bands.setColorAt(i, c0);
        q.setFromAxisAngle(Z, e.ang);
        M.compose(v.set(e.mid[0], e.mid[1], bandZ[i]), q, s.set(1, open, 1));
        bands.setMatrixAt(i, M);
      }
      levers.instanceMatrix.needsUpdate = true; levers.instanceColor.needsUpdate = true;
      waterA.instanceMatrix.needsUpdate = true; waterB.instanceMatrix.needsUpdate = true;
      bands.instanceMatrix.needsUpdate = true;
      if (bands.instanceColor) bands.instanceColor.needsUpdate = true;
      waterA.instanceColor.needsUpdate = true; waterB.instanceColor.needsUpdate = true;
    };
    // allocate instanceColor before the first render so the program is compiled with it
    for (let i = 0; i < N; i++) { levers.setColorAt(i, cLever); bands.setColorAt(i, cWet); waterA.setColorAt(i, cDeep); waterB.setColorAt(i, cDeep); }
    update(-1);
    g.userData = { update, ends, parts: { pipes, joints, bodies, collars, levers, caps, waterA, waterB, bands } };
    return g;
  }

  // ---------------------------------------------------------------- highlight ring around one valve
  /** focusRing() -> Mesh (magenta annulus in front of the valve); userData.set(x, y, level 0..1, grow) */
  function focusRing(o = {}) {
    const R = { ...spec.ring, ...o };
    const m = new THREE.Mesh(new THREE.RingGeometry(R.r0, R.r1, 48), new THREE.MeshBasicMaterial({ color: P.highlight, transparent: true, depthWrite: false }));
    m.name = "focusRing"; m.renderOrder = 3;
    m.userData.set = (x, y, k, grow = 1) => {
      m.visible = k > 0.003; m.material.opacity = clamp(k);
      m.position.set(x, y, R.z); m.scale.setScalar(grow);
    };
    m.userData.set(0, 0, 0);
    return m;
  }

  // ---------------------------------------------------------------- overlay caption (enamel sign plate)
  /** caption() -> overlay plate (navy, white rule, a blue drop icon, white sans text); userData.show(text, alpha, pulse) */
  function caption(o = {}) {
    const Q = { ...spec.caption, ...o };
    const Wp = 1200, Hp = Q.h + 24;
    const mesh = screenCanvas(stage, Wp, Hp, (x, W, H, st) => {
      if (!st.text) return;
      x.font = `${Q.weight} ${Q.cap}px ${Q.font}`;
      const tw = Math.round(x.measureText(st.text).width);
      const pad = Math.round(Q.cap * 0.62), ic = Math.round(Q.h * 0.5);
      const pw = Math.min(W - 16, pad + ic + Math.round(pad * 0.8) + tw + pad), ph = Q.h, oy = 6, ox = Math.round((W - pw) / 2);
      x.fillStyle = "rgba(10,20,40,0.28)"; x.beginPath(); x.roundRect(ox + 2, oy + 7, pw, ph, 16); x.fill();
      x.fillStyle = Q.plate; x.beginPath(); x.roundRect(ox, oy, pw, ph, 16); x.fill();
      x.strokeStyle = Q.edge; x.lineWidth = 3; x.beginPath(); x.roundRect(ox + 6, oy + 6, pw - 12, ph - 12, 11); x.stroke();
      // icon: a water drop
      const cx = ox + pad + ic / 2, cy = oy + ph / 2 + ic * 0.08, rr = ic * 0.36;
      x.fillStyle = Q.drop; x.beginPath();
      x.moveTo(cx, cy - ic * 0.52);
      x.bezierCurveTo(cx + rr * 0.6, cy - rr * 0.6, cx + rr, cy - rr * 0.1, cx + rr, cy + rr * 0.15);
      x.arc(cx, cy + rr * 0.15, rr, 0, Math.PI, false);
      x.bezierCurveTo(cx - rr, cy - rr * 0.1, cx - rr * 0.6, cy - rr * 0.6, cx, cy - ic * 0.52);
      x.fill();
      x.fillStyle = Q.ink; x.textBaseline = "middle"; x.textAlign = "left";
      x.fillText(st.text, ox + pad + ic + Math.round(pad * 0.8), oy + Math.round(ph / 2) + 2);
    }, { upload: true, willReadFrequently: true });
    mesh.userData.place(Q.x - Wp / 2, Q.y - 6);
    mesh.userData.show = (text, a) => { mesh.userData.set({ text }); mesh.userData.opacity(a); };
    return mesh;
  }

  // ---------------------------------------------------------------- everything for one plan
  /**
   * percolationBoard(plan) -> { group, net, top, bottom, ring, update(t) } (adds itself to the scene)
   *   update(t): every lever, water fill and band from the plan; bottom trough level; the deciding link marked in the
   *   highlight colour (ring in front of its valve, its lever and its band) over the `ring: { on, off, inDur, outDur }` window.
   */
  function percolationBoard(plan, o = {}) {
    const group = new THREE.Group(); group.name = "percolation";
    const bd = board(); group.add(bd);
    const E = extents();
    const top = trough({ name: "troughTop", y: E.yTop - spec.trough.h / 2, level: 1 }); group.add(top);
    const bottom = trough({ name: "troughBottom", y: E.yBot + spec.trough.h / 2, level: 0 }); group.add(bottom);
    const RW = o.ring ?? { on: Infinity, off: Infinity, inDur: 0.4, outDur: 0.6 };
    const level = (t) => smoothstep(RW.on, RW.on + RW.inDur, t) * (1 - smoothstep(RW.off, RW.off + RW.outDur, t));
    const net = network(plan, { highlight: { id: plan.starId, level } }); group.add(net);
    const ring = focusRing(); group.add(ring);
    stage.scene.add(group);
    const st = net.userData.ends[plan.starId];
    return {
      group, net, top, bottom, ring, board: bd, starMid: st.mid,
      update(t) {
        net.userData.update(t);
        bottom.userData.setLevel(plan.troughB(t));
        const k = level(t);
        const pulse = 1 + 0.1 * Math.sin(Math.max(0, t - RW.on) * 6.0) * (1 - smoothstep(RW.on + 2.5, RW.on + 3.5, t)); // pulses in beat 4, steady after
        const grow = 1 + (spec.ring.grow ?? 0) * smoothstep(RW.on + 2.7, RW.on + 4.7, t); // bigger for the final wide
        ring.userData.set(st.mid[0], st.mid[1], k, pulse * grow);
      },
    };
  }

  const props = { board, trough, network, focusRing, caption, percolationBoard };
  return {
    spec, palette: P, materials: { ...materials, glass }, lights, post, textStyle, camera: spec.camera, props, factories: {}, sfx: spec.sfx,
    plan: percolate, motion: percolate, extents, wx, wy,
  };
}
