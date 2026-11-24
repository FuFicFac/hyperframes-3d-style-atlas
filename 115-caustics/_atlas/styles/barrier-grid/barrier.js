// styles/barrier-grid/barrier.js — the Node-safe planner for "Barrier Grid" (scanimation). Plain data in, plain data out:
// no THREE, no window, no DOM. Imported by style.js (the picture) AND scene.config.js (SCORE), so the print, the barrier's
// motion and every sound cue come from the same plan.
//
// What it holds:
//   1. birdFrames(B, N): the six frames of an original bird flapping (front view, bold silhouettes), each a fixed list of
//      parametric primitives (uneven capsules, circles, triangles) in picture coordinates (metres, picture centre = origin).
//      The same list feeds the GLSL print (packed into uniform arrays) and the JS reference sampler printSample().
//   2. The interlace: strip i = floor((x + picW/2) / w) carries frame (i mod N). stripFrame(), PRINT_GLSL.
//   3. createBarrierPlan(cfg): the barrier's x offset in STRIPS as a closed form of t (slide in, land, run, single steps,
//      swing). Offset k (integer) puts the clear slits over strips i ≡ k (mod N) — frame k. It is the ONLY animated input of
//      the picture. plan.events() turns the same offset into sound cues: one pitched tick per strip crossed (the pitch is
//      the frame that crossing uncovers), acetate hiss chunks scaled by speed, the slide-in whoosh and the landing thump.
// Motion type: exact — the moving picture is produced by occlusion of a static print, not keyframed.
import { clamp, ease, lerp } from "../../kit/time.js";

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ the bird frames
/** primitive kinds (slot layout is the same for every frame; GLSL is generated from it). INK = which ink a slot prints in:
 *  `teal` = the bird's main ink (printed navy since the 114 review), `black` = detail ink (beak, eyes: printed teal). */
export const KIND = { capsule: 0, triangle: 1, circle: 2 };
export const INK = { teal: 0, black: 1 };

/**
 * birdPose(B, phi) -> { arm, hand, bob } angles (rad) and body lift (m) at flap phase phi ∈ [0, 1).
 * phi = 0: wings up (a V), phi = 0.5: wings down. The hand lags the arm, so the wing bends into an M on the way.
 */
export function birdPose(B, phi) {
  const c = Math.cos(TAU * phi);
  const arm = B.armAngle.mean + B.armAngle.amp * c;
  const hand = arm + B.handAngle.amp * Math.cos(TAU * phi - B.handAngle.lag);
  return { arm, hand, bob: -B.bob * c };
}

/**
 * birdFrames(B, N) -> frames[k] = [{ kind, ink, a:[x,y], b:[x,y], c:[x,y], ra, rb }] (same slot layout for all k).
 * Teal: body, head, tail, per wing arm + hand + two tip feathers. Black: beak, two eyes.
 */
export function birdFrames(B, N) {
  const frames = [];
  for (let k = 0; k < N; k++) {
    const { arm, hand, bob } = birdPose(B, k / N);
    const s = B.scale, [cx, cy] = B.centre;
    const P = (x, y) => [cx + s * x, cy + s * (y + bob)];
    const prims = [];
    const cap = (a, b, ra, rb, ink = INK.teal) => prims.push({ kind: KIND.capsule, ink, a, b, c: [0, 0], ra: s * ra, rb: s * rb });
    const circ = (a, r, ink = INK.teal) => prims.push({ kind: KIND.circle, ink, a, b: a, c: [0, 0], ra: s * r, rb: s * r });
    const tri = (a, b, c, ink = INK.teal) => prims.push({ kind: KIND.triangle, ink, a, b, c, ra: 0, rb: 0 });
    // body, head, tail
    cap(P(...B.body.top), P(...B.body.bot), B.body.rTop, B.body.rBot);
    circ(P(...B.head.c), B.head.r);
    tri(P(...B.tail[0]), P(...B.tail[1]), P(...B.tail[2]));
    // wings
    for (const side of [-1, 1]) {
      const S = [side * B.shoulder[0], B.shoulder[1]];
      const W = [S[0] + side * B.arm * Math.cos(arm), S[1] + B.arm * Math.sin(arm)];
      const T = [W[0] + side * B.hand * Math.cos(hand), W[1] + B.hand * Math.sin(hand)];
      cap(P(...S), P(...W), B.rShoulder, B.rWrist);
      cap(P(...W), P(...T), B.rWrist, B.rTip);
      // two extra primaries fanning back from the outer hand (rotated toward the trailing edge)
      const Pm = [lerp(W[0], T[0], 0.5), lerp(W[1], T[1], 0.5)];
      for (const f of [0.55, 1]) {
        const ang = -side * B.feather.spread * f;
        const dx = T[0] - Pm[0], dy = T[1] - Pm[1];
        const L = 0.9 + 0.1 * (1 - f);
        const Tf = [Pm[0] + L * (dx * Math.cos(ang) - dy * Math.sin(ang)), Pm[1] + L * (dx * Math.sin(ang) + dy * Math.cos(ang))];
        cap(P(...Pm), P(...Tf), B.feather.r * 1.6, B.feather.r * 0.7);
      }
    }
    // black ink: beak, eyes
    tri(P(...B.beak[0]), P(...B.beak[1]), P(...B.beak[2]), INK.black);
    circ(P(-B.eyes.dx, B.eyes.y), B.eyes.r, INK.black);
    circ(P(B.eyes.dx, B.eyes.y), B.eyes.r, INK.black);
    frames.push(prims);
  }
  return frames;
}

/** packFrames(frames) -> { slots: [{kind, ink}], A: Float32-ready [ax,ay,bx,by]×n, B: [cx,cy,ra,rb]×n } (frame-major) */
export function packFrames(frames) {
  const slots = frames[0].map((p) => ({ kind: p.kind, ink: p.ink }));
  const A = [], Bv = [];
  for (const prims of frames) {
    prims.forEach((p, j) => {
      if (p.kind !== slots[j].kind || p.ink !== slots[j].ink) throw new Error("barrier: frame slot layout differs");
      A.push(p.a[0], p.a[1], p.b[0], p.b[1]);
      Bv.push(p.c[0], p.c[1], p.ra, p.rb);
    });
  }
  return { slots, A, B: Bv, perFrame: slots.length };
}

// ------------------------------------------------------------------------------------------------ SDFs (JS twins of GLSL)
function sdCapsule(px, py, ax, ay, bx, by, ra, rb) {
  // Inigo Quilez's uneven capsule (2D, arbitrary orientation)
  const qx0 = px - ax, qy0 = py - ay, dx = bx - ax, dy = by - ay;
  const h = dx * dx + dy * dy;
  if (h < 1e-12) return Math.hypot(qx0, qy0) - ra;
  let qx = (qx0 * dy - qy0 * dx) / h; const qy = (qx0 * dx + qy0 * dy) / h;
  qx = Math.abs(qx);
  const b = ra - rb, cx = Math.sqrt(Math.max(1e-12, h - b * b)), cy = b;
  const k = cx * qy - cy * qx, m = cx * qx + cy * qy, n = qx * qx + qy * qy;
  if (k < 0) return Math.sqrt(h * n) - ra;
  if (k > cx) return Math.sqrt(h * (n + 1 - 2 * qy)) - rb;
  return m - ra;
}
function sdTriangle(px, py, p0, p1, p2) {
  const e0 = [p1[0] - p0[0], p1[1] - p0[1]], e1 = [p2[0] - p1[0], p2[1] - p1[1]], e2 = [p0[0] - p2[0], p0[1] - p2[1]];
  const v0 = [px - p0[0], py - p0[1]], v1 = [px - p1[0], py - p1[1]], v2 = [px - p2[0], py - p2[1]];
  const pq = (v, e) => { const t = clamp((v[0] * e[0] + v[1] * e[1]) / (e[0] * e[0] + e[1] * e[1])); return [v[0] - e[0] * t, v[1] - e[1] * t]; };
  const q0 = pq(v0, e0), q1 = pq(v1, e1), q2 = pq(v2, e2);
  const s = Math.sign(e0[0] * e2[1] - e0[1] * e2[0]);
  const d0 = [q0[0] * q0[0] + q0[1] * q0[1], s * (v0[0] * e0[1] - v0[1] * e0[0])];
  const d1 = [q1[0] * q1[0] + q1[1] * q1[1], s * (v1[0] * e1[1] - v1[1] * e1[0])];
  const d2 = [q2[0] * q2[0] + q2[1] * q2[1], s * (v2[0] * e2[1] - v2[1] * e2[0])];
  const dx = Math.min(d0[0], d1[0], d2[0]), dy = Math.min(d0[1], d1[1], d2[1]);
  return -Math.sqrt(dx) * Math.sign(dy);
}
/** frameSD(prims, x, y) -> { teal, black } signed distances (m) for one frame */
export function frameSD(prims, x, y) {
  let teal = 1e3, black = 1e3;
  for (const p of prims) {
    let d;
    if (p.kind === KIND.capsule) d = sdCapsule(x, y, p.a[0], p.a[1], p.b[0], p.b[1], p.ra, p.rb);
    else if (p.kind === KIND.circle) d = Math.hypot(x - p.a[0], y - p.a[1]) - p.ra;
    else d = sdTriangle(x, y, p.a, p.b, p.c);
    if (p.ink === INK.teal) teal = Math.min(teal, d); else black = Math.min(black, d);
  }
  return { teal, black };
}

/**
 * pulseRing(R, N, k, x, y, aa) -> 0..1 coverage of frame k's wing-beat rings at (x, y): concentric rings around R.centre,
 * radius (n + k/N)·spacing, so they expand by spacing/N per frame and loop after N frames. GLSL twin: pulseRing() in the
 * print shader. They fill the field: in the scrambled print they become a busy texture that hides the bird.
 */
export function pulseRing(R, N, k, x, y, aa = 0.002) {
  const d = Math.hypot(x - R.centre[0], y - R.centre[1]);
  const ph = d / R.spacing - k / N;
  const e = Math.abs(ph - Math.round(ph)) * R.spacing - R.width / 2;
  const cov = 1 - clamp((e + aa) / (2 * aa));
  const fade = 1 - R.fade * clamp((d - R.fadeFrom) / (R.fadeTo - R.fadeFrom));
  const low = clamp((y - R.yMin) / 0.015);
  return cov * fade * low;
}

// ------------------------------------------------------------------------------------------------ the interlace
/** stripIndex(card, w, x) -> integer strip under card x (picture's left edge = strip 0's left edge) */
export const stripIndex = (card, w, x) => Math.floor((x + card.picW / 2) / w);
/** stripFrame(i, N) -> frame carried by strip i */
export const stripFrame = (i, N) => ((i % N) + N) % N;
/** frameUnderSlits(offset, N) -> frame shown when the barrier sits at an integer offset (strips) */
export const frameUnderSlits = (offset, N) => stripFrame(Math.round(offset), N);

/**
 * printSample(S, frames, x, y, { offset = null, aa = 0.002 }) -> [r, g, b] (sRGB 0..1). The JS reference of the print
 * (and, with offset, of the view through the barrier, head-on, no parallax). For previews / tests in Node.
 */
export function printSample(S, frames, x, y, o = {}) {
  const { offset = null, aa = 0.002 } = o;
  const G = S.grid, C = S.card, N = G.frames, w = G.strip;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const paper = hex(S.palette.paper), teal = hex(S.palette.teal), ink = hex(S.palette.ink), bar = hex(S.palette.barrier);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  if (offset != null) {
    const u = (x + C.picW / 2) / w - offset, m = ((u % N) + N) % N;
    if (!(m < G.slit) && y > S.acetate.bottom) return bar;
  }
  let col = paper;
  const inX = Math.abs(x) <= C.picW / 2;
  const i = stripIndex(C, w, x), k = stripFrame(i, N);
  if (inX && Math.abs(y) <= C.picH / 2) {
    const d = frameSD(frames[k], x, y);
    col = mix(col, mix(paper, teal, S.pulse.tint), pulseRing(S.pulse, N, k, x, y, aa));
    col = mix(col, ink, 1 - clamp((d.teal + aa) / (2 * aa)));
    col = mix(col, teal, 1 - clamp((d.black + aa) / (2 * aa)));
    if (y >= C.meter.y0 && y <= C.meter.y0 + ((k + 1) / N) * C.meter.h) col = teal;
  } else if (inX && y >= C.band.y0 && y <= C.band.y1) {
    const top = C.band.y0 + ((k + 1) / N) * (C.band.y1 - C.band.y0);
    if (y <= top) col = ink;
  }
  return col;
}

// ------------------------------------------------------------------------------------------------ GLSL
/**
 * printGLSL(slots, N) -> GLSL source: uniforms uPA[], uPB[] (frame-major, slots per frame), sdCapsule/sdTriangle,
 * frameSD(k, p, dT, dK) unrolled over the slot layout (only the base index is dynamic).
 */
export function printGLSL(slots, N) {
  const S = slots.length, NP = S * N;
  const lines = slots.map((sl, j) => {
    const call = sl.kind === KIND.capsule ? `sdCapsule(p, A.xy, A.zw, B.z, B.w)` : sl.kind === KIND.circle ? `length(p - A.xy) - B.z` : `sdTriangle(p, A.xy, A.zw, B.xy)`;
    const tgt = sl.ink === INK.teal ? "dT" : "dK";
    return `  { vec4 A = uPA[b + ${j}]; vec4 B = uPB[b + ${j}]; ${tgt} = min(${tgt}, ${call}); }`;
  });
  return /* glsl */ `
#define BG_N ${N}
#define BG_S ${S}
uniform vec4 uPA[${NP}];
uniform vec4 uPB[${NP}];
float sdCapsule(vec2 p, vec2 pa, vec2 pb, float ra, float rb) {
  p -= pa; pb -= pa;
  float h = max(dot(pb, pb), 1e-10);
  vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;
  q.x = abs(q.x);
  float b = ra - rb;
  vec2 c = vec2(sqrt(max(h - b * b, 1e-10)), b);
  float k = c.x * q.y - c.y * q.x;
  float m = dot(c, q);
  float n = dot(q, q);
  if (k < 0.0) return sqrt(h * n) - ra;
  else if (k > c.x) return sqrt(max(h * (n + 1.0 - 2.0 * q.y), 0.0)) - rb;
  return m - ra;
}
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
void frameSD(int k, vec2 p, out float dT, out float dK) {
  int b = k * BG_S;
  dT = 1e3; dK = 1e3;
${lines.join("\n")}
}
`;
}

// ------------------------------------------------------------------------------------------------ the barrier plan
/** linear-ramp trapezoid: distance travelled at t (0 → dist), velocity ramps up over `up`, cruises, ramps down */
function trapezoid(t, t0, up, cruise, down, dist) {
  const vmax = dist / (up / 2 + cruise + down / 2);
  const u = t - t0;
  if (u <= 0) return 0;
  if (u < up) return (0.5 * vmax * u * u) / up;
  const d1 = 0.5 * vmax * up;
  if (u < up + cruise) return d1 + vmax * (u - up);
  const d2 = d1 + vmax * cruise, r = u - up - cruise;
  if (r < down) return d2 + vmax * r - (0.5 * vmax * r * r) / down;
  return dist;
}

/**
 * createBarrierPlan(cfg) -> plan
 *   cfg = { N, w, gap, slide: { t0, t1, from, to, ease }, drop: { t0, t1, hover },
 *           run: { t0, up, cruise, down, strips }, steps: { times: [...], dur, ease }, swing: { t0, t1, amp }, tick: { maxRate } }
 *   plan.offset(t)  barrier x offset in strips (the only animated input of the picture)
 *   plan.gap(t)     acetate height above the print (m): hovering while it slides in, then laid down
 *   plan.visible(t) false before the slide-in starts (the card is alone in beat 1)
 *   plan.uniformsAt(t) -> { offset, gap, visible, frame, speed }
 *   plan.events({ end }) -> sound plan [{ t, kind, ... }]
 */
export function createBarrierPlan(cfg) {
  const { N, w } = cfg;
  const SL = cfg.slide, DR = cfg.drop, RU = cfg.run, ST = cfg.steps, SW = cfg.swing;
  const runEnd = RU.t0 + RU.up + RU.cruise + RU.down;
  const base1 = SL.to;                         // where the sheet lands (frame shown in beat 2)
  const base2 = base1 + RU.strips;             // after the run
  const base3 = base2 + ST.times.length;       // after the single steps
  const stepEase = ease[ST.ease ?? "inOutCubic"];
  const slideEase = ease[SL.ease ?? "outCubic"];

  function offset(t) {
    if (t < SL.t0) return SL.from;
    if (t < SL.t1) return lerp(SL.from, SL.to, slideEase(clamp((t - SL.t0) / (SL.t1 - SL.t0))));
    if (t < RU.t0) return base1;
    if (t < runEnd) return base1 + trapezoid(t, RU.t0, RU.up, RU.cruise, RU.down, RU.strips);
    if (t < SW.t0) {
      let o = base2;
      for (const ti of ST.times) o += stepEase(clamp((t - ti) / ST.dur));
      return o;
    }
    const u = clamp((t - SW.t0) / (SW.t1 - SW.t0));
    return base3 + (SW.amp * (1 - Math.cos(TAU * u))) / 2;
  }
  const gap = (t) => cfg.gap + DR.hover * (1 - ease.inQuad(clamp((t - DR.t0) / (DR.t1 - DR.t0))));
  const visible = (t) => t >= SL.t0;
  const speed = (t) => (offset(t + 5e-4) - offset(t - 5e-4)) / 1e-3;
  const uniformsAt = (t) => ({ offset: offset(t), gap: gap(t), visible: visible(t), frame: frameUnderSlits(offset(t), N), speed: speed(t) });

  /** sound plan from the same offset: ticks per strip crossed, hiss chunks by speed, slide whoosh, landing, steps */
  function events({ end, dt = 1e-3, chunk = 0.2 } = {}) {
    const ev = [];
    const maxRate = cfg.tick?.maxRate ?? 26;
    // strip crossings (one pitched tick each, while the sheet is slow enough to count)
    let prev = offset(0), last = null;
    const fl = (v) => Math.floor(v + 1e-7);              // an offset resting on an integer (± rounding) has not crossed it
    const slideMid = (SL.t0 + SL.t1) / 2;                // the sheet is still entering (mostly off the picture) before this
    for (let i = 1, n = Math.round(end / dt); i <= n; i++) {
      const t = i * dt, o = offset(t);
      const a = fl(prev), b = fl(o);
      if (a !== b && visible(t) && t > slideMid) {
        const up = b > a, crossed = up ? b : a;          // the integer passed
        const rate = Math.abs(o - prev) / dt;
        const frac = (crossed - prev) / (o - prev);
        const tc = +(t - dt + frac * dt).toFixed(4);
        // a touch-and-return on the same integer (a swing's turning point) is one tick, not two
        const repeat = last && last.crossed === crossed && tc - last.t < 0.12;
        if (rate <= maxRate && !repeat) { last = { t: tc, crossed }; ev.push({ t: tc, kind: "tick", frame: stripFrame(crossed, N), dir: up ? 1 : -1, rate }); }
      }
      prev = o;
    }
    // acetate hiss in chunks, level from mean speed (strips/s), only while visible and moving
    for (let t0 = SL.t0; t0 < end - 1e-6; t0 += chunk) {
      const d = Math.abs(offset(Math.min(end, t0 + chunk)) - offset(t0)) / chunk;
      if (d > 0.4) ev.push({ t: +t0.toFixed(3), kind: "hiss", dur: chunk * 1.6, rate: d });
    }
    ev.push({ t: SL.t0, kind: "slide", dur: SL.t1 - SL.t0 });
    ev.push({ t: DR.t1, kind: "land" });
    ST.times.forEach((ti, j) => ev.push({ t: ti, kind: "step", j }));
    ev.push({ t: SW.t1, kind: "settle" });
    return ev.sort((p, q) => p.t - q.t);
  }

  /** a short fingerprint of the plan's key results (compare Node vs page) */
  function fingerprint() {
    let h = 2166136261 >>> 0;
    const mixIn = (v) => { const s = Math.round(v * 1e6).toString(); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    for (let i = 0; i <= 150; i++) { const t = i * 0.1; mixIn(offset(t)); mixIn(gap(t)); }
    return h.toString(16).padStart(8, "0");
  }

  return {
    cfg, N, w, offset, gap, visible, speed, uniformsAt, events, fingerprint,
    bases: { base1, base2, base3 }, runEnd,
  };
}
