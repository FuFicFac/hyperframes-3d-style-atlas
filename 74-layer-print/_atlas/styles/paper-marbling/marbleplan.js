// styles/paper-marbling/marbleplan.js — the marbling PLAN (pure, THREE-free, Node-safe: imports only kit/time.js).
// Shared by style.js (picture) and scene.config.js (SCORE, camera fit, framing gate).
//
// Mathematical marbling (closed forms, after the published "mathematical marbling" work of Lu, Jaffer and others):
//   ink drop   centre C, radius r:  forward  P' = C + (P - C) * sqrt(1 + r^2 / |P - C|^2)      (area preserving)
//                                   inverse  P  = C + (P' - C) * sqrt(1 - r^2 / |P' - C|^2),  |P' - C| < r -> the new ink
//   tine line  point A, unit dir M: forward  P' = P + M * alpha * lambda / (d + lambda),  d = |(P - A) . N|
//                                   inverse  P  = P' - M * (same shift)      (d does not change along M: exact)
//   comb       the same with d = distance to the nearest of many parallel tines `spacing` apart.
// A pattern is these operations applied in plan order. To colour a point at time t we walk the list BACKWARDS from the
// newest started operation, undoing each one (the running one by its progress): if the point lands inside a drop it
// takes that ink, otherwise it ends on the bare bath. `sample()` here and the fragment shader in style.js are the same
// loop; `stateAt(t)` packs the per-operation numbers the shader needs. Every frame is a pure function of t.
//
// Stroke progress: the drag follows the tool. A stroke displaces ink only where the tool tip has passed
// (g = smoothstep((tip - s) / soft)); when the stroke ends g = 1 everywhere, i.e. exactly the closed form above.
//
// Coordinates: marbling plane (x, y) in metres, centred on the bath; world X = x, world Z = y, bath surface at bathY.
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";

const PI = Math.PI;
const E = (name) => ease[name] ?? ease.linear;

/**
 * ringDrops({ start, cadence, hop, groups: [{ c: [x, y], inks: [name...], r: [m...] }] }) -> [{ t, c, r, ink }]
 *   Several drops on the same centre one after another (rings); `hop` extra seconds when the centre changes.
 */
export function ringDrops({ start = 0.3, cadence = 0.24, hop = 0.2, groups }) {
  const out = [];
  let t = start;
  groups.forEach((g, gi) => {
    g.inks.forEach((ink, k) => {
      out.push({ t: +t.toFixed(4), c: g.c, r: g.r[k] ?? g.r[g.r.length - 1], ink, group: gi, k });
      t += cadence;
    });
    t += hop;
  });
  return out;
}

/** piecewise track through keys [{ t, p: [x,y,z], hop = 0, ease = "inOutCubic" }]; holds before the first / after the last */
function track(keys) {
  const K = [...keys].sort((a, b) => a.t - b.t);
  return (t) => {
    if (t <= K[0].t) return [...K[0].p];
    for (let i = 1; i < K.length; i++) {
      if (t <= K[i].t) {
        const a = K[i - 1], b = K[i], span = b.t - a.t;
        const u = span > 1e-9 ? E(b.ease ?? "inOutCubic")(clamp((t - a.t) / span)) : 1;
        return [lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u) + (b.hop ?? 0) * Math.sin(PI * u), lerp(a.p[2], b.p[2], u)];
      }
    }
    return [...K[K.length - 1].p];
  };
}

/** the sheet's cross-section: flat for z <= f, then round a cylinder of radius R up to angle th, then straight */
function curl(z, f, R, th) {
  const s = z - f;
  if (s <= 0) return [z, 0];
  const arc = R * th;
  if (s <= arc) { const ph = s / R; return [f + R * Math.sin(ph), R * (1 - Math.cos(ph))]; }
  return [f + R * Math.sin(th) + (s - arc) * Math.cos(th), R * (1 - Math.cos(th)) + (s - arc) * Math.sin(th)];
}

/**
 * createPlan(recipe) -> plan
 *   recipe = {
 *     tray: { w, h, bathY }, inks: [names], maxOps,
 *     defaults: { drop, tine, comb }                        (spec.drop / spec.tine / spec.comb)
 *     drops:   [{ t (landing time), c: [x, y], r, ink }]
 *     strokes: [{ kind: "tine" | "comb", t0, t1, a: [x, y], dir: [mx, my], alpha?, lambda?, soft?, spacing? }]
 *     tools:   spec.tools,   paper: spec.paper + { t: { in, laid, peel, peelEnd, lift, liftEnd } },   end
 *   }
 *   plan = { ops, n, stateAt(t), sample(p, t), coverage(t), pipetteAt(t), stylusAt(t), combAt(t), paper, events() }
 */
export function createPlan(recipe) {
  const { tray, inks, defaults: D, tools: T, end = 15 } = recipe;
  const maxOps = recipe.maxOps ?? 26;
  const hw = tray.w / 2, hh = tray.h / 2, bathY = tray.bathY;
  const inkIndex = (name) => { const i = inks.indexOf(name); if (i < 0) throw new Error(`marbleplan: unknown ink "${name}"`); return i; };

  // ------------------------------------------------------------------ operations, in start order
  const ops = [];
  for (const d of recipe.drops ?? []) {
    ops.push({ kind: "drop", t0: d.t, t1: d.t + (d.spread ?? D.drop.spread), c: [...d.c], r: d.r, ink: inkIndex(d.ink), inkName: d.ink, ease: d.ease ?? D.drop.ease });
  }
  for (const s of recipe.strokes ?? []) {
    const dflt = s.kind === "comb" ? D.comb : D.tine;
    const len = Math.hypot(s.dir[0], s.dir[1]), m = [s.dir[0] / len, s.dir[1] / len], n = [-m[1], m[0]];
    // travel range along m inside the bath: a single tine uses its own line, a comb the whole rectangle
    let sIn, sOut;
    if (s.kind === "comb") {
      const ext = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map((c) => (c[0] - s.a[0]) * m[0] + (c[1] - s.a[1]) * m[1]);
      sIn = Math.min(...ext); sOut = Math.max(...ext);
    } else {
      let lo = -Infinity, hi = Infinity;
      for (const [o, d, h] of [[s.a[0], m[0], hw], [s.a[1], m[1], hh]]) {
        if (Math.abs(d) < 1e-9) continue;
        const a = (-h - o) / d, b = (h - o) / d;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
      sIn = lo; sOut = hi;
    }
    const margin = s.margin ?? dflt.margin;
    const op = {
      kind: s.kind, t0: s.t0, t1: s.t1, a: [...s.a], m, n, alpha: s.alpha ?? dflt.alpha, lambda: s.lambda ?? dflt.lambda,
      soft: s.soft ?? dflt.soft, spacing: s.kind === "comb" ? s.spacing ?? dflt.spacing : 0, sIn: sIn + margin, sOut: sOut - margin, ease: "inOutSine",
    };
    if (s.kind === "comb") { // tine offsets along the bar (n) that fall inside the bath, for the comb prop
      const ext = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map((c) => (c[0] - s.a[0]) * n[0] + (c[1] - s.a[1]) * n[1]);
      op.nMin = Math.min(...ext); op.nMax = Math.max(...ext); op.tines = [];
      for (let k = Math.ceil((op.nMin + 0.03) / op.spacing); k * op.spacing <= op.nMax - 0.03; k++) op.tines.push(+(k * op.spacing).toFixed(5));
    }
    ops.push(op);
  }
  ops.sort((a, b) => a.t0 - b.t0);
  if (ops.length > maxOps) throw new Error(`marbleplan: ${ops.length} operations > maxOps ${maxOps}`);
  ops.forEach((o, i) => { o.i = i; });
  const N = ops.length;

  /** progress of one op at t: drops -> current radius, strokes -> tip position along m (and tool position) */
  const dropRadius = (o, t) => (t <= o.t0 ? 0 : o.r * Math.sqrt(E(o.ease)(clamp((t - o.t0) / (o.t1 - o.t0)))));
  const strokeU = (o, t) => E(o.ease)(clamp((t - o.t0) / (o.t1 - o.t0)));
  const strokeTip = (o, t) => lerp(o.sIn, o.sOut + o.soft, strokeU(o, t));
  const toolS = (o, t) => lerp(o.sIn, o.sOut, strokeU(o, t));

  /**
   * stateAt(t, out?) -> { A, B, C } Float32Array(maxOps * 4) each — the shader uniforms:
   *   drop:   A = (1, cx, cy, radius now)   B = (ink index, 0, 0, 0)
   *   stroke: A = (2, ax, ay, alpha)        B = (mx, my, lambda, spacing | 0)   C = (tip, soft, 0, 0)
   *   not started / unused: A.x = 0
   */
  function stateAt(t, out = { A: new Float32Array(maxOps * 4), B: new Float32Array(maxOps * 4), C: new Float32Array(maxOps * 4) }) {
    out.A.fill(0); out.B.fill(0); out.C.fill(0);
    for (const o of ops) {
      if (t <= o.t0) continue;
      const k = o.i * 4;
      if (o.kind === "drop") {
        out.A[k] = 1; out.A[k + 1] = o.c[0]; out.A[k + 2] = o.c[1]; out.A[k + 3] = dropRadius(o, t);
        out.B[k] = o.ink;
      } else {
        out.A[k] = 2; out.A[k + 1] = o.a[0]; out.A[k + 2] = o.a[1]; out.A[k + 3] = o.alpha;
        out.B[k] = o.m[0]; out.B[k + 1] = o.m[1]; out.B[k + 2] = o.lambda; out.B[k + 3] = o.spacing;
        out.C[k] = strokeTip(o, t); out.C[k + 1] = o.soft;
      }
    }
    return out;
  }

  /** sample([x, y], t) -> { ink: index | -1, op: index | -1, q: [u, v] (position inside the drop, radius 1), p: source point } */
  function sample(p, t) {
    let x = p[0], y = p[1];
    for (let i = N - 1; i >= 0; i--) {
      const o = ops[i];
      if (t <= o.t0) continue;
      if (o.kind === "drop") {
        const r = dropRadius(o, t), dx = x - o.c[0], dy = y - o.c[1], d2 = dx * dx + dy * dy;
        if (d2 < r * r) return { ink: o.ink, op: i, q: [dx / Math.max(r, 1e-4), dy / Math.max(r, 1e-4)], p: [x, y] };
        const k = Math.sqrt(1 - (r * r) / d2);
        x = o.c[0] + dx * k; y = o.c[1] + dy * k;
      } else {
        const rx = x - o.a[0], ry = y - o.a[1];
        const s = rx * o.m[0] + ry * o.m[1], nn = rx * o.n[0] + ry * o.n[1];
        const d = o.spacing > 0 ? Math.abs((((nn + o.spacing / 2) % o.spacing) + o.spacing) % o.spacing - o.spacing / 2) : Math.abs(nn);
        const g = smoothstep(0, 1, (strokeTip(o, t) - s) / o.soft);
        const sh = (o.alpha * o.lambda) / (d + o.lambda) * g;
        x -= o.m[0] * sh; y -= o.m[1] * sh;
      }
    }
    return { ink: -1, op: -1, q: [0, 0], p: [x, y] };
  }

  /** share of the bath covered by ink at t (grid estimate; for notes/tests) */
  function coverage(t, nx = 64, ny = 36) {
    let hit = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (sample([-hw + ((i + 0.5) / nx) * tray.w, -hh + ((j + 0.5) / ny) * tray.h], t).ink >= 0) hit++;
    return hit / (nx * ny);
  }

  // ------------------------------------------------------------------ tools
  const drops = ops.filter((o) => o.kind === "drop");
  const tines = ops.filter((o) => o.kind === "tine");
  const combs = ops.filter((o) => o.kind === "comb");
  const DR = D.drop, tipY = bathY + DR.height;

  // pipette: over each drop's centre from just before its bead forms until just after it lets go
  const pipKeys = [];
  drops.forEach((o, i) => {
    const rel = o.t0 - DR.fall, p = [o.c[0], tipY, o.c[1]];
    pipKeys.push({ t: i === 0 ? Math.min(0, rel - DR.form - 0.03) : rel - DR.form - 0.03, p, hop: T.pipette.hop });
    pipKeys.push({ t: rel + 0.03, p });
  });
  if (drops.length) pipKeys.push({ t: drops[drops.length - 1].t0 + 0.75, p: T.pipette.park, hop: 0.3 });
  const pipTrack = pipKeys.length ? track(pipKeys) : () => [...T.pipette.park];
  const pipOff = drops.length ? drops[drops.length - 1].t0 + 0.75 : 0;

  /** pipetteAt(t) -> { tip: [x,y,z], ink: index of the ink in the tube, visible, beads: [{ p, scale, ink }] } */
  function pipetteAt(t) {
    const tip = pipTrack(t);
    let ink = drops.length ? drops[0].ink : 0;
    const beads = [];
    for (const o of drops) {
      const rel = o.t0 - DR.fall, born = rel - DR.form;
      if (t >= born - 0.12) ink = o.ink; // the tube shows the ink about to fall
      if (t < born || t >= o.t0) continue;
      const size = DR.bead * (0.75 + 0.6 * (o.r / 0.34));
      if (t < rel) beads.push({ p: [o.c[0], tipY - size * 0.6, o.c[1]], scale: size * clamp((t - born) / DR.form), ink: o.ink });
      else { const u = (t - rel) / DR.fall; beads.push({ p: [o.c[0], bathY + (DR.height - size * 0.6) * (1 - u * u), o.c[1]], scale: size, ink: o.ink }); }
    }
    return { tip, ink, visible: t < pipOff, beads };
  }

  /** tool track for a list of strokes: park -> (start, end) per stroke with hops between -> exit */
  function strokeTrack(list, tool, yDip) {
    if (!list.length) return { at: () => [...tool.park], on: 0, off: 0 };
    const keys = [], at = (o, s) => [o.a[0] + o.m[0] * s, yDip, o.a[1] + o.m[1] * s];
    const pre = tool.pre ?? 0.5, post = tool.post ?? 0.55;
    keys.push({ t: list[0].t0 - pre, p: tool.park });
    list.forEach((o) => {
      keys.push({ t: o.t0, p: at(o, o.sIn), hop: tool.hop });
      keys.push({ t: o.t1, p: at(o, o.sOut), ease: o.ease });
    });
    const last = list[list.length - 1];
    keys.push({ t: last.t1 + post, p: tool.exit ?? tool.park, hop: tool.hop });
    return { at: track(keys), on: list[0].t0 - pre, off: last.t1 + post };
  }
  const stylusTr = strokeTrack(tines, T.stylus, bathY - T.stylus.dip);
  const combTr = strokeTrack(combs, T.comb, bathY - T.comb.dip);
  /** stylusAt(t) -> { tip, visible }   combAt(t) -> { p (centre of the tine tips), visible, n: bar direction, tines, span } */
  const stylusAt = (t) => ({ tip: stylusTr.at(t), visible: t > stylusTr.on && t < stylusTr.off });
  const combAt = (t) => ({ p: combTr.at(t), visible: t > combTr.on && t < combTr.off });
  const combShape = combs.length ? { n: combs[0].n, m: combs[0].m, tines: combs[0].tines, nMin: combs[0].nMin, nMax: combs[0].nMax } : null;

  // ------------------------------------------------------------------ the sheet
  const PP = recipe.paper;
  let paper = null;
  if (PP) {
    const pw = PP.w / 2, ph = PP.h / 2, Tm = PP.t;
    const slideEnd = Tm.in + (Tm.laid - Tm.in) * PP.lay.slide;
    const Rp = PP.peel.radius, thp = PP.peel.angle, fEnd = -ph - Rp * thp;
    // rigid pose when the peel ends (sheet centre z = 0): a plane through OA leaning back by thp
    const OA = curl(0, fEnd, Rp, thp);
    const aB = PI / 2 + PP.present.elevation, CB = PP.present.centre;
    const y0 = bathY + PP.gap;
    /** pointAt(x, z, t) -> world [X, Y, Z] of the sheet point (x across, z toward the viewer) */
    function pointAt(x, z, t) {
      let X = x, zz = z, yy = 0;
      if (t < Tm.laid) { // carried in from the side, held up by its near edge; then rolled down from the far edge
        const u = E("inOutSine")(clamp((t - slideEnd) / (Tm.laid - slideEnd)));
        [zz, yy] = curl(z, lerp(-ph, ph, u), PP.lay.radius, PP.lay.angle);
        const k = 1 - E("outCubic")(clamp((t - Tm.in) / (slideEnd - Tm.in)));
        X += PP.lay.from[0] * k; yy += PP.lay.from[1] * k; zz += PP.lay.from[2] * k;
      } else if (t > Tm.peel) {
        const u = E("inOutSine")(clamp((t - Tm.peel) / (Tm.peelEnd - Tm.peel)));
        [zz, yy] = curl(z, lerp(ph, fEnd, u), Rp, thp);
        if (t > Tm.lift) { // rigid: rotate about OA toward the camera-facing angle and carry OA to the presentation centre
          const e = E("inOutCubic")(clamp((t - Tm.lift) / (Tm.liftEnd - Tm.lift)));
          const d = (aB - thp) * e, c = Math.cos(d), s = Math.sin(d), vz = zz - OA[0], vy = yy - OA[1];
          zz = OA[0] + vz * c - vy * s + (CB[2] - OA[0]) * e;
          yy = OA[1] + vz * s + vy * c + (CB[1] - y0 - OA[1]) * e + PP.present.hop * Math.sin(PI * e);
          X += CB[0] * e;
        }
      }
      return [X, y0 + yy, zz];
    }
    const cornersAt = (t) => [[-pw, -ph], [pw, -ph], [pw, ph], [-pw, ph]].map(([x, z]) => pointAt(x, z, t));
    paper = {
      w: PP.w, h: PP.h, t: Tm, slideEnd, pointAt, cornersAt,
      /** state(t) -> { visible, covered (bath under the sheet has given up its ink), ghost 0..1 (show-through on the back) } */
      state: (t) => ({ visible: t >= Tm.in, covered: t >= Tm.laid, ghost: smoothstep(slideEnd + 0.2, Tm.peel, t) }),
    };
  }

  // ------------------------------------------------------------------ sound events (same times as the picture)
  function events() {
    const ev = [];
    for (const o of drops) ev.push({ kind: "plip", t: o.t0, r: o.r, x: o.c[0], ink: o.inkName });
    for (const o of tines) ev.push({ kind: "drag", t: o.t0, dur: o.t1 - o.t0, x: o.a[0] });
    for (const o of combs) ev.push({ kind: "comb", t: o.t0, dur: o.t1 - o.t0, x: 0 });
    if (paper) {
      ev.push({ kind: "lay", t: paper.slideEnd, dur: paper.t.laid - paper.slideEnd, x: 0 });
      ev.push({ kind: "peel", t: paper.t.peel, dur: paper.t.peelEnd - paper.t.peel, x: 0 });
      ev.push({ kind: "present", t: paper.t.lift, dur: paper.t.liftEnd - paper.t.lift, x: 0 });
    }
    return ev.sort((a, b) => a.t - b.t);
  }

  return { ops, n: N, maxOps, tray, inks, end, stateAt, sample, coverage, pipetteAt, stylusAt, combAt, combShape, paper, events };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function marbleVoices(SND) {
  return {
    plip: (e) => {
      const pitch = lerp(SND.plip.pitch[1], SND.plip.pitch[0], clamp((e.r - 0.16) / 0.2));
      return [
        { type: "bubble", dur: 0.12, pitch, gain: SND.plip.gain },
        { type: "bubble", dur: 0.2, pitch: pitch * 0.5, gain: SND.plip.bubble, offset: 0.03 },
      ];
    },
    drag: (e) => [
      { type: "whoosh", dir: "out", dur: e.dur + 0.25, q: SND.drag.q, pitch: SND.drag.pitch, gain: SND.drag.gain },
      { type: "bubble", dur: 0.14, pitch: 0.6, gain: SND.drag.bubble },
    ],
    comb: (e) => [
      { type: "whoosh", dir: "in", dur: e.dur + 0.2, q: 0.8, pitch: 0.6, gain: SND.comb.gain },
      { type: "rustle", dur: e.dur, density: SND.comb.density, pitch: 0.7, gain: SND.comb.rustle },
    ],
    lay: (e) => [{ type: "paper", dur: e.dur + 0.2, density: 0.3, gain: SND.lay.gain }],
    peel: (e) => [
      { type: "paper", dur: e.dur, density: 0.55, pitch: 1.15, gain: SND.peel.gain },
      { type: "whoosh", dir: "in", dur: e.dur, q: 1.2, pitch: 1.1, gain: SND.peel.whoosh },
    ],
    present: (e) => [
      { type: "whoosh", dir: "out", dur: e.dur, q: 1.0, pitch: 0.9, gain: SND.present.whoosh },
      { type: "chime", dur: 2.0, pitch: 1.0, gain: SND.present.chime, offset: e.dur * 0.8 },
    ],
  };
}
