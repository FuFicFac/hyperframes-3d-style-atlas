// styles/op-art/opplan.js — the pattern schedule for "Op Art". PURE: no THREE, no window, no DOM (Node-safe), so
// scene.config.js imports it for SCORE and style.js reads the very same plan for the shader uniforms.
//
// One plan, four acts, all closed-form in t:
//   bulge   centre c(t) (eased legs between keyed points) and radius R(t) (grows from 0 with a soft outBack)
//   wipe    x of a hard vertical wipe line: stripes (right of it) -> concentric rings (left of it)
//   acetate x offset of the clear ring sheet: slides in, glides across the panel centre, slides out; FRINGE events are the
//           exact times the offset crosses a multiple of the ring period (each crossing moves every moiré band by one
//           fringe), ALIGN is when the two ring sets coincide (the moiré vanishes)
//   grid    Chebyshev ring k of cells appears at gridIn + k*revealStep and flips at flip + k*flipStep; dome strength
//           D(t) eases 0 -> dome during the reveal and dome -> tunnel during the flip
// events() turns the same numbers into sound cues (one marimba note per ring, one tick per fringe, ...).
import { clamp, lerp, ease } from "../../kit/time.js";

const seg = (t, t0, t1, a, b, e = "inOutCubic") => lerp(a, b, ease[e](clamp((t - t0) / Math.max(1e-6, t1 - t0))));

/**
 * createPlan({ times, pattern, panel }) -> plan
 *   times: { grow, growDur, legs: [{ t0, t1, to: [x, y] }], start: [x, y], wipe, wipeDur, slideIn: [t0, t1], glide: [t0, t1],
 *            slideOut: [t0, t1], gridIn, revealStep, flip, flipStep, domeDur, flipDur, reveal: [t0, t1], end }
 *   pattern / panel: spec.pattern / spec.panel
 */
export function createPlan({ times: T, pattern: P, panel: PN }) {
  const W = PN.w, H = PN.h;
  const A = P.acetate, G = P.grid;
  const off = W / 2 + A.w / 2 + 0.25;                 // sheet fully clear of the panel
  const glideA = A.glideFrom ?? 0.42, glideB = A.glideTo ?? -0.42;
  // highest Chebyshev ring that touches the panel (lens off at the edges: lensR < W/2)
  const maxRing = Math.ceil(W / 2 / G.cell - 0.5);

  // ---------------------------------------------------------------- bulge
  function bulgeAt(t) {
    let [x, y] = T.start;
    for (const L of T.legs) {
      if (t <= L.t0) break;
      const u = ease.inOutCubic(clamp((t - L.t0) / (L.t1 - L.t0)));
      x = lerp(x, L.to[0], u); y = lerp(y, L.to[1], u);
    }
    // soft outBack grow (overshoot ~6 %) so the sphere 'pops' out of the wall in the first second
    const u = clamp((t - T.grow) / T.growDur);
    const s = 0.8, g = u <= 0 ? 0 : 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
    return [x, y, P.bulge.R * g, P.bulge.A];
  }

  // ---------------------------------------------------------------- wipe stripes -> rings
  const wipeAt = (t) => (t < T.wipe ? -10 : t > T.wipe + T.wipeDur ? 10 : seg(t, T.wipe, T.wipe + T.wipeDur, -W / 2 - 0.05, W / 2 + 0.05, "inOutSine"));

  // ---------------------------------------------------------------- acetate
  function acetateAt(t) {
    const on = t >= T.slideIn[0] && t <= T.slideOut[1];
    let x = off;
    if (t >= T.slideIn[0]) x = seg(t, T.slideIn[0], T.slideIn[1], off, glideA, "outCubic");
    if (t >= T.glide[0]) x = seg(t, T.glide[0], T.glide[1], glideA, glideB, "inOutSine");
    if (t >= T.slideOut[0]) x = seg(t, T.slideOut[0], T.slideOut[1], glideB, -off, "inCubic");
    return { on, x };
  }
  // exact crossing time of x = target during the glide (bisection on the monotone ease)
  const glideTime = (target) => {
    let a = T.glide[0], b = T.glide[1];
    const f = (t) => acetateAt(t).x - target;   // decreasing
    for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (f(m) > 0) a = m; else b = m; }
    return +((a + b) / 2).toFixed(4);
  };
  const fringes = [];
  for (let k = Math.floor(glideA / A.period); k >= Math.ceil(glideB / A.period); k--) if (k !== 0) fringes.push({ k, t: glideTime(k * A.period) });
  const alignAt = glideTime(0);

  // ---------------------------------------------------------------- grid
  function domeAt(t) {
    if (t < T.gridIn) return 0;
    if (t < T.flip) return seg(t, T.gridIn, T.gridIn + T.domeDur, 0, G.dome);
    return seg(t, T.flip, T.flip + T.flipDur, G.dome, G.tunnel);
  }
  const ringIn = (k) => T.gridIn + k * T.revealStep;
  const ringFlip = (k) => T.flip + k * T.flipStep;

  /** shader-facing state at t (pure) */
  function stateAt(t) {
    return {
      bulge: bulgeAt(t), wipe: wipeAt(t), acetate: acetateAt(t), dome: domeAt(t),
      gridReveal: [T.gridIn, T.revealStep], flip: [T.flip, T.flipStep],
    };
  }

  /** sound events (sorted) */
  function events() {
    const ev = [{ kind: "bed", t: 0, dur: T.end }];
    ev.push({ kind: "grow", t: T.grow });
    for (const L of T.legs) ev.push({ kind: "leg", t: L.t0, dur: L.t1 - L.t0, pan: clamp(L.to[0] / (W / 2), -1, 1) * 0.6 });
    ev.push({ kind: "wipe", t: T.wipe, dur: T.wipeDur });
    ev.push({ kind: "slide", t: T.slideIn[0], dur: T.slideIn[1] - T.slideIn[0], pan: 0.5 });
    for (const f of fringes) ev.push({ kind: "fringe", t: f.t, k: f.k, pan: clamp(f.k * A.period / 0.5, -1, 1) * 0.4 });
    ev.push({ kind: "align", t: alignAt });
    ev.push({ kind: "slide", t: T.slideOut[0], dur: T.slideOut[1] - T.slideOut[0], pan: -0.5 });
    for (let k = 0; k <= maxRing; k++) ev.push({ kind: "cellIn", t: +ringIn(k).toFixed(4), k, n: maxRing });
    for (let k = 0; k <= maxRing; k++) ev.push({ kind: "cellFlip", t: +ringFlip(k).toFixed(4), k, n: maxRing });
    ev.push({ kind: "reveal", t: T.reveal[0], dur: T.reveal[1] - T.reveal[0] });
    ev.push({ kind: "land", t: T.reveal[1] });
    return ev.sort((a, b) => a.t - b.t);
  }

  return { times: T, maxRing, fringes, alignAt, offX: off, bulgeAt, wipeAt, acetateAt, domeAt, ringIn, ringFlip, stateAt, events };
}

/** voices for kit scoreFromEvents, from spec.sound */
export function opVoices(S) {
  const SC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28]; // major pentatonic steps, one per ring
  return {
    bed: (e) => [{ type: "pad", root: S.bed.root, chord: S.bed.chord, dur: e.dur, attack: 0.25, release: 1.2, brightness: S.bed.brightness, gain: S.bed.gain }],
    grow: () => [
      { type: "pop", pitch: 0.55, gain: S.grow.pop },
      { type: "thud", dur: 0.5, pitch: 0.8, gain: S.grow.thud, offset: 0.02 },
    ],
    leg: (e) => [
      { type: "whoosh", dir: "in", dur: e.dur, q: 1.2, gain: S.travel.whoosh, pan: e.pan },
      { type: "servo", dur: e.dur, hz: 98, hz2: 131, grit: 0.1, gain: S.travel.servo, pan: e.pan },
    ],
    wipe: (e) => [{ type: "whoosh", dir: "out", dur: e.dur + 0.25, q: 2.2, pitch: 1.4, gain: S.wipe.whoosh }],
    slide: (e) => [{ type: "paper", dur: e.dur + 0.15, density: 0.5, gain: S.slide.paper, pan: e.pan }],
    fringe: (e) => [{ type: "tick", pitch: 1.2 + 0.04 * Math.abs(e.k), gain: S.fringe.tick, pan: e.pan }],
    align: () => [{ type: "chime", dur: 1.4, notes: 3, pitch: 0.75, gain: S.align.chime }],
    cellIn: (e) => [{ type: "marimba", hz: 392 * Math.pow(2, SC[e.k % SC.length] / 12), decay: 0.18, gain: S.cell.marimba, pan: 0 }],
    cellFlip: (e) => [{ type: "marimba", hz: 392 * Math.pow(2, SC[(e.n - e.k) % SC.length] / 12) / 2, decay: 0.22, gain: S.cell.marimba * 1.15, pan: 0 }],
    reveal: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 1.0, pitch: 0.8, gain: S.reveal.whoosh, pan: -0.4 }],
    land: () => [
      { type: "thud", dur: 0.6, pitch: 0.7, gain: S.reveal.thud },
      { type: "chime", dur: 1.6, notes: 4, pitch: 0.6, gain: S.reveal.chime, offset: 0.03 },
    ],
  };
}
