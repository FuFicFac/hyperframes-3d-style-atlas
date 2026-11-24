// styles/chromatography/chromaplan.js — the pure chromatography planner (Node-safe: no THREE, no window, no DOM).
// Imported by style.js (the picture) and by scene.config.js (SCORE, framing gate), so the sound and the image come
// from the same numbers.
//
// The model (closed form, no simulation):
//   - Solvent front (Lucas–Washburn wicking): distance above the solvent surface  d = K * sqrt(p), where p is
//     PROCESS time. The video is a time-lapse: p runs at 1x while the front climbs to the dot, then the clock speeds
//     up (smoothstep ramp to `rate`x) so the slow later climb still reads in seconds. K is solved so the front reaches
//     the ink dot at `meetDot`; `rate` is solved so the front stands at `frontAtStop` when the strip is lifted out.
//   - Each dye travels at a FIXED fraction (its retention factor Rf) of the distance the front has moved past the
//     origin:  centre = dotV + Rf * max(0, front - dotV).
//   - Band width grows linearly with the distance the dye has travelled (sigma = s0 + a * Rf * D); the band's peak
//     falls so its total amount is conserved (amplitude ~ s0^2 / (sigmaU * sigmaV)); a little of each dye is left
//     behind as a faint streak ("tailing").
//   - Colour on paper is subtractive: transmittance = exp(-sum(absorbance_dye * concentration)), so three dyes on
//     top of each other read black and pull apart into blue, magenta and yellow.
// Strip coordinates: u = metres across the strip from its centre line, v = metres up from its bottom edge.
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";

const sq = (x) => x * x;

/** process-time clock: 1x until a, smoothstep ramp to `rate`x over [a, b], `rate`x after; closed-form integral */
function processClock(t, tw, a, b, rate, stop) {
  const T = Math.min(t, stop);
  if (T <= tw) return 0;
  let p = T - tw;
  if (T > a) {
    const span = b - a;
    const u = clamp((T - a) / span);
    const ramp = span * (u * u * u - 0.5 * u * u * u * u) + Math.max(0, T - b);
    p += (rate - 1) * ramp;
  }
  return p;
}

/** dye state for one ink at a given front position (strip coords) -> [{ name, rf, u, v, su, sv, amp, tail, crisp }] */
export function dyeState(ink, { dotV, dotU = 0, front, deposit = 1, spread }) {
  const D = Math.max(0, (front ?? -1) - dotV); // how far the front has run past the origin
  const S = spread;
  const s0 = S.s0 * lerp(0.55, 1, Math.sqrt(clamp(deposit)));
  const wetDot = smoothstep(0, S.bloomAt, D); // dry dot -> wet dot (edge softens, dot blooms a little)
  return ink.map((d) => {
    const travel = d.rf * D;
    const bloom = S.bloom * wetDot;
    const su = Math.min(s0 + bloom + S.au * travel, S.suMax ?? Infinity); // capped: the band meets the strip edges
    const sv = s0 + bloom * 0.6 + S.av * travel;
    const amp = (S.gain ?? 1) * d.mass * deposit * (sq(S.s0) / (su * sv));
    return {
      name: d.dye, rf: d.rf, u: dotU, v: dotV + travel, su, sv, amp,
      tail: d.tail ?? S.tail, origin: dotV, crisp: lerp(S.crispDry, S.crispWet ?? 1, wetDot),
    };
  });
}

/**
 * createPlan(o) -> plan
 *   o = {
 *     strip: { L, W, bow, dotV, dotU },        // strip size (m), dot position (strip coords)
 *     solventY,                                // world y of the solvent surface
 *     ink: [{ dye, rf, mass, tail? }],         // the black ink's dyes
 *     spread: { s0, au, av, bloom, bloomAt, crispDry, tail },
 *     t: { penIn, touch0, touch1, penOut, lower0, lower1, wet, meetDot, rampA, rampB, stop, liftEnd, hang, end },
 *     frontAtStop,                             // strip v of the front when the strip leaves the solvent
 *     arm: { y0, y1 },                         // clamp-arm height before / after lowering (strip hangs below it)
 *     clipDrop,                                // arm -> strip top distance
 *     home: [x, z],                            // strip centre line in the jar
 *     slot: { p: [x, yTop, z], rise },         // rack position of the strip top when hung; rise = lift clearance
 *     pen: { axis: [x,y,z], approach, retreat },
 *   }
 */
export function createPlan(o) {
  const T = o.t, ST = o.strip;
  // ---- strip pose ------------------------------------------------------------------------------------------
  const armY = (t) => lerp(o.arm.y0, o.arm.y1, ease.inOutCubic(clamp((t - T.lower0) / (T.lower1 - T.lower0))));
  const homeTop = (t) => [o.home[0], armY(t) - o.clipDrop, o.home[1]];
  const finalHomeTop = [o.home[0], o.arm.y1 - o.clipDrop, o.home[1]];
  const bottomYAtRest = finalHomeTop[1] - ST.L;
  const solventVRest = o.solventY - bottomYAtRest; // strip v of the solvent surface once lowered
  // lift path: a cubic Bezier for the strip TOP from the jar to the rack slot (up, back and over)
  const P0 = finalHomeTop, P3 = o.slot.p;
  const P1 = [P0[0], P0[1] + o.slot.rise, P0[2]];
  const P2 = [P3[0], P3[1] + o.slot.rise * 0.7, P3[2] + 0.25];
  const bez = (u) => {
    const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
    return [0, 1, 2].map((k) => a * P0[k] + b * P1[k] + c * P2[k] + d * P3[k]);
  };
  /** top(t) -> world position of the strip's top centre; tilt = small sway while carried */
  function stripPose(t) {
    if (t < T.stop) return { top: homeTop(t), sway: 0, phase: "jar" };
    const u = ease.inOutCubic(clamp((t - T.stop) / (T.liftEnd - T.stop)));
    const settle = t > T.liftEnd ? Math.exp(-(t - T.liftEnd) * 3.2) * Math.sin((t - T.liftEnd) * 9) : 0;
    return { top: bez(u), sway: 0.16 * Math.sin(Math.PI * u) * Math.sin(Math.PI * u * 1.5) + 0.05 * settle, phase: t < T.liftEnd ? "lift" : "rack" };
  }
  const bottomY = (t) => stripPose(t).top[1] - ST.L;
  /** strip v of the solvent surface (negative = not dipped) */
  const solventV = (t) => (stripPose(t).phase === "jar" ? o.solventY - bottomY(t) : -1);

  // ---- front -----------------------------------------------------------------------------------------------
  const pMeet = T.meetDot - T.wet;
  const K = (ST.dotV - solventVRest) / Math.sqrt(pMeet);
  const pStopWanted = sq((o.frontAtStop - solventVRest) / K);
  // p(stop) = (stop - wet) + (rate - 1) * R  with R = 0.5 (b - a) + (stop - b)
  const Rr = 0.5 * (T.rampB - T.rampA) + Math.max(0, T.stop - T.rampB);
  const rate = 1 + (pStopWanted - (T.stop - T.wet)) / Rr;
  if (!(rate >= 1)) throw new Error(`chromaplan: frontAtStop ${o.frontAtStop} is reachable without a time-lapse; lower it or move meetDot`);
  const clock = (t) => processClock(t, T.wet, T.rampA, T.rampB, rate, T.stop);
  /** strip v of the solvent front (null before the strip is wet) */
  const front = (t) => (t < T.wet ? null : solventVRest + K * Math.sqrt(clock(t)));
  const deposit = (t) => smoothstep(T.touch0, T.touch1, t);
  const wetness = (t) => (t < T.wet ? 0 : 1 - 0.55 * smoothstep(T.liftEnd - 0.4, T.end + 0.6, t)); // drying once out

  function dyesAt(t) {
    return dyeState(o.ink, { dotV: ST.dotV, dotU: ST.dotU ?? 0, front: front(t), deposit: deposit(t), spread: o.spread });
  }

  // ---- pen ---------------------------------------------------------------------------------------------------
  const ax = o.pen.axis, an = Math.hypot(...ax), axis = ax.map((x) => x / an);
  /** penAt(t) -> { tip, visible }  (tip touches the dot between touch0 and touch1) */
  function penAt(t) {
    const top = homeTop(t);
    const dot = [top[0] + (ST.dotU ?? 0), top[1] - ST.L + ST.dotV, top[2] + ST.bow + 0.002];
    let gap;
    if (t < T.touch0) gap = o.pen.approach * (1 - ease.outCubic(clamp((t - T.penIn) / (T.touch0 - T.penIn))));
    else if (t < T.touch1) gap = 0;
    else gap = o.pen.retreat * ease.inCubic(clamp((t - T.touch1) / (T.penOut - T.touch1)));
    // a small sideways twist while dotting: the nib rolls a few mm (closed form)
    const roll = t >= T.touch0 && t < T.touch1 ? 0.0015 * Math.sin(((t - T.touch0) / (T.touch1 - T.touch0)) * Math.PI * 2) : 0;
    return { tip: [dot[0] + axis[0] * gap + roll, dot[1] + axis[1] * gap, dot[2] + axis[2] * gap], axis, visible: t < T.penOut };
  }

  // ---- band separation times (for the marimba notes): first t where a band clears its neighbours -------------
  function separations(k = 1.5, dt = 1 / 120) {
    const order = o.ink.map((d, i) => i).sort((a, b) => o.ink[a].rf - o.ink[b].rf);
    const out = o.ink.map(() => null);
    for (let t = T.meetDot; t <= T.stop + 1e-9; t += dt) {
      const D = dyesAt(t);
      order.forEach((i, j) => {
        if (out[i] != null) return;
        const me = D[i];
        const below = j > 0 ? D[order[j - 1]] : { v: ST.dotV, sv: o.spread.s0 };
        const above = j < order.length - 1 ? D[order[j + 1]] : null;
        const okBelow = me.v - below.v > k * (me.sv + below.sv);
        const okAbove = !above || above.v - me.v > k * (me.sv + above.sv);
        if (okBelow && okAbove) out[i] = +t.toFixed(4);
      });
    }
    return out.map((t, i) => ({ t, dye: o.ink[i].dye, rf: o.ink[i].rf }));
  }

  // ---- events (picture and sound share these) -----------------------------------------------------------------
  function events({ hissStep = 0.32 } = {}) {
    const ev = [];
    ev.push({ t: T.penIn, kind: "penIn", dur: T.touch0 - T.penIn });
    ev.push({ t: T.touch0, kind: "tick" });
    ev.push({ t: T.lower0, kind: "lower", dur: T.lower1 - T.lower0 });
    // the moment the strip's bottom edge meets the solvent
    let dipT = T.lower1;
    for (let t = T.lower0; t <= T.lower1; t += 1 / 240) if (bottomY(t) <= o.solventY) { dipT = t; break; }
    ev.push({ t: +dipT.toFixed(4), kind: "dip" });
    // paper hiss that follows the front: one soft grain per step, level = front speed (normalised)
    const speeds = [];
    for (let t = T.wet + 0.02; t < T.stop; t += hissStep) {
      const v0 = front(t), v1 = front(Math.min(t + 0.05, T.stop));
      speeds.push({ t, s: Math.max(0, (v1 - v0) / 0.05) });
    }
    const sMax = Math.max(...speeds.map((s) => s.s), 1e-6);
    for (const s of speeds) ev.push({ t: +s.t.toFixed(4), kind: "hiss", dur: hissStep * 1.9, level: s.s / sMax, v: front(s.t) });
    for (const s of separations()) if (s.t != null) ev.push({ t: s.t, kind: "split", dye: s.dye, rf: s.rf });
    ev.push({ t: T.stop, kind: "lift", dur: T.liftEnd - T.stop });
    ev.push({ t: T.liftEnd, kind: "hang" });
    ev.push({ t: T.hang, kind: "chord" });
    return ev.sort((a, b) => a.t - b.t);
  }

  return {
    K, rate, solventVRest, clock, front, deposit, wetness, dyesAt, stripPose, bottomY, solventV, penAt, separations, events,
    strip: ST, t: T, clipDrop: o.clipDrop,
    /** world-space corner points of the strip at t (for framing) */
    cornersAt(t) {
      const { top } = stripPose(t);
      const w = ST.W / 2;
      return [[top[0] - w, top[1], top[2]], [top[0] + w, top[1], top[2]], [top[0] - w, top[1] - ST.L, top[2]], [top[0] + w, top[1] - ST.L, top[2]]];
    },
    /** world point of strip coords (u, v) at t (sway ignored: framing only) */
    worldAt(u, v, t) { const { top } = stripPose(t); return [top[0] + u, top[1] - ST.L + v, top[2]]; },
  };
}

/** finishedDyes(ink, { dotV, frontV, spread }) -> static dye state for a strip that has already been run */
export function finishedDyes(ink, { dotV, dotU = 0, frontV, spread }) {
  return dyeState(ink, { dotV, dotU, front: frontV, deposit: 1, spread });
}

/** chromaVoices(SND) -> voices for kit/schedule.scoreFromEvents (one entry per event kind) */
export function chromaVoices(SND) {
  const notes = SND.split.notes; // Hz by dye name
  return {
    penIn: (e) => [{ type: "whoosh", dir: "in", dur: e.dur + 0.15, q: 1.4, pitch: 1.5, gain: SND.penIn.gain }],
    tick: () => [
      { type: "tick", dur: 0.03, pitch: 1.2, gain: SND.tick.gain },
      { type: "penScratch", dur: 0.22, speed: 0.6, gain: SND.tick.scratch, offset: 0.02 },
    ],
    lower: (e) => [{ type: "whir", dur: e.dur, hz: 150, hz2: 110, gain: SND.lower.gain }],
    dip: () => [{ type: "bubble", dur: 0.12, pitch: 0.8, gain: SND.dip.gain }, { type: "bubble", dur: 0.16, pitch: 0.55, gain: SND.dip.gain * 0.6, offset: 0.05 }],
    hiss: (e) => (e.level < 0.02 ? [] : [{ type: "paper", dur: e.dur, density: SND.hiss.density, pitch: SND.hiss.pitch, gain: SND.hiss.gain * (0.35 + 0.65 * Math.sqrt(e.level)) }]),
    split: (e) => [{ type: "marimba", hz: notes[e.dye] ?? 440, decay: 0.45, dur: 1.4, mallet: 0.4, gain: SND.split.gain }],
    lift: (e) => [{ type: "whoosh", dir: "out", dur: e.dur + 0.2, q: 1.1, pitch: 0.8, gain: SND.lift.gain }, { type: "bubble", dur: 0.14, pitch: 1.1, gain: SND.dip.gain * 0.7, offset: 0.1 }],
    hang: () => [{ type: "click", dur: 0.04, pitch: 0.9, gain: SND.hang.gain }],
    chord: () => [{ type: "marimba", hz: SND.chord.root, notes: SND.chord.notes, step: 0.07, decay: 0.8, dur: 1.9, mallet: 0.35, gain: SND.chord.gain }],
  };
}
