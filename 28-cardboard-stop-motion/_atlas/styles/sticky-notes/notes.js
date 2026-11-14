// styles/sticky-notes/notes.js — the board planner for "Sticky Notes". PURE: no THREE, no window, no DOM.
// Imported by style.js (the picture) AND by a scene's scene.config.js (beats, camera, SCORE), so every rip, slap,
// marker squeak and dot pop in the sound comes from exactly the schedule the picture plays.
//
//   const PLAN = planBoard(PROGRAM, STYLE_SPEC);
//   noteState(PLAN, id, t)   -> where a note is and how its sheet is bent at t (phases: pad, padPeel, fly, slap, rest,
//                                lift, hop/slide, reslap)
//   sheetAngle(st, s, x, NS, breeze) -> bend angle of the sheet at distance s down from the top edge, column x
//   dotState(d, t), penAt(PLAN, t), breezeLift(PLAN, X, t), padUnder(PLAN), boardShot(box, framing)
//   PLAN.events -> scoreFromEvents(PLAN.events, stickyVoices(STYLE_SPEC.sound))
//
// Board coordinates: metres, board centre (0, 0), y up, board surface z = 0. A note's position is its TOP-CENTRE.
import { clamp, lerp, smoothstep, ease, hash01, rng } from "../../kit/time.js";
import { layoutStrokeText } from "../../kit/strokefont.js";
import { sampleCameraKeys, screenExtent, boxCorners } from "../../kit/framing.js";

const PI = Math.PI;

// ------------------------------------------------------------------ pad pose
/** padPose(S) -> { top: [x,y,z] top-centre of the pad's front sheet, normal, up, lean, bottom } (board coords). */
export function padPose(S, x = S.pad.x) {
  const B = S.board, N = S.note.size, lean = S.pad.lean, T = S.pad.thick;
  const ledgeTop = -B.h / 2 - B.frame.width - B.ledge.gap;
  const up = [0, Math.cos(lean), -Math.sin(lean)];
  const normal = [0, Math.sin(lean), Math.cos(lean)];
  // back-top edge touches the board (z = 0 + frame front clearance): front-top z = T cos(lean) + clearance
  const topZ = T * Math.cos(lean) + B.frame.front * 0.5;
  const top = [x, ledgeTop + T * Math.sin(lean) + N * Math.cos(lean), topZ];
  const bottom = [x, top[1] - N * up[1], top[2] - N * up[2]];
  return { top, bottom, normal, up, lean, ledgeTop };
}

// ------------------------------------------------------------------ marks (marker ink)
function wobbleFn(seed, amp) {
  const a = hash01(seed, 1) * 6.28, b = hash01(seed, 2) * 6.28, f1 = 5 + hash01(seed, 3) * 4, f2 = 13 + hash01(seed, 4) * 8;
  return (s) => amp * (0.65 * Math.sin(s * f1 + a) + 0.35 * Math.sin(s * f2 + b));
}
function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], Bp = pts[i], d = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([A[0] + ((Bp[0] - A[0]) * k) / n, A[1] + ((Bp[1] - A[1]) * k) / n]);
  }
  return out;
}
/** Hand wobble perpendicular to the stroke (seeded), after resampling. */
function handStroke(pts, seed, amp, step = 0.008) {
  const P = resample(pts, step);
  const w = wobbleFn(seed, amp);
  let s = 0;
  const out = [];
  for (let i = 0; i < P.length; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const o = w(s);
    out.push([P[i][0] - ty * o, P[i][1] + tx * o]);
  }
  return out;
}
const plen = (P) => P.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);

/** markStrokes(mark, M) -> [[x,y], ...][] in board metres (before timing). */
export function markStrokes(m, M) {
  const seed = m.seed ?? m.id ?? "mk";
  const sd = (k) => `${seed}:${k}`;
  const amp = m.wobble ?? M.wobble;
  const line = (a, b, bow = 0, k = 0) => {
    const n = 16, out = [];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    for (let i = 0; i <= n; i++) {
      const u = i / n, sag = bow * Math.sin(PI * u);
      out.push([a[0] + dx * u - (dy / l) * sag, a[1] + dy * u + (dx / l) * sag]);
    }
    return handStroke(out, sd(k), amp);
  };
  switch (m.kind) {
    case "line": return [line(m.a, m.b, m.bow ?? 0)];
    case "polyline": return [handStroke(m.pts, sd(0), amp)];
    case "arrow": {
      const S0 = line(m.a, m.b, m.bow ?? 0), e = S0[S0.length - 1], p = S0[Math.max(0, S0.length - 4)];
      const ang = Math.atan2(e[1] - p[1], e[0] - p[0]), h = m.head ?? 0.06;
      const w1 = [e[0] - Math.cos(ang - 0.5) * h, e[1] - Math.sin(ang - 0.5) * h];
      const w2 = [e[0] - Math.cos(ang + 0.5) * h, e[1] - Math.sin(ang + 0.5) * h];
      return [S0, handStroke([w1, e, w2], sd(1), amp * 0.4)];
    }
    case "underline": {
      const a = [m.x0, m.y], b = [m.x1, m.y + (m.rise ?? 0.012)];
      return m.double ? [line(a, b, 0.004, 0), line([m.x0 + 0.03, m.y - 0.035], [m.x1 - 0.04, m.y - 0.03], 0.003, 1)] : [line(a, b, 0.004)];
    }
    case "box": {
      // one loose stroke round a rounded rectangle, starting near the top-left, overshooting past its start
      const { x0, y0, x1, y1 } = m, r = m.r ?? 0.06, over = m.over ?? 0.1, pts = [];
      const r1 = rng(sd("box"));
      const j = () => r1.range(-0.012, 0.012);
      const arc = (cx, cy, a0, a1) => { for (let k = 0; k <= 6; k++) { const a = a0 + ((a1 - a0) * k) / 6; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      pts.push([x0 + r + 0.05, y1 + j()]);
      pts.push([x1 - r, y1 + j()]); arc(x1 - r, y1 - r, PI / 2, 0);
      pts.push([x1 + j(), y0 + r]); arc(x1 - r, y0 + r, 0, -PI / 2);
      pts.push([x0 + r, y0 + j()]); arc(x0 + r, y0 + r, -PI / 2, -PI);
      pts.push([x0 + j(), y1 - r]); arc(x0 + r, y1 - r, PI, PI / 2);
      pts.push([x0 + r + 0.05 + over, y1 + 0.016]);
      return [handStroke(pts, sd(0), amp * 0.8)];
    }
    case "circle": {
      const { c, rx, ry = rx } = m, a0 = m.a0 ?? 2.2, sw = m.sweep ?? 6.7, pts = [];
      for (let k = 0; k <= 48; k++) { const a = a0 - (sw * k) / 48, g = 1 + 0.04 * (k / 48); pts.push([c[0] + Math.cos(a) * rx * g, c[1] + Math.sin(a) * ry * g]); }
      return [handStroke(pts, sd(0), amp)];
    }
    case "check": {
      const s = m.size ?? 0.1, [cx, cy] = m.c;
      return [handStroke([[cx - s * 0.5, cy], [cx - s * 0.15, cy - s * 0.4], [cx + s * 0.55, cy + s * 0.55]], sd(0), amp * 0.4)];
    }
    case "text": {
      const L = layoutStrokeText(m.text, m.cap, { align: m.align ?? "center", letterSpacing: 0.3, bendRadius: 0.14 });
      const r1 = rng(sd("txt"));
      const out = [];
      for (const ch of L.chars) {
        const rot = r1.range(-0.05, 0.05), sc = 1 + r1.range(-0.06, 0.06), dy = r1.range(-0.012, 0.012) * m.cap / 0.12;
        const cx = (ch.x0 + ch.x1) / 2;
        for (const st of ch.strokes) {
          const P = st.map(([x, y]) => {
            const lx = (x - cx) * sc, ly = y * sc;
            return [m.x + cx + lx * Math.cos(rot) - ly * Math.sin(rot), m.y + dy + lx * Math.sin(rot) + ly * Math.cos(rot)];
          });
          out.push(handStroke(P, sd(out.length), amp * 0.25, 0.006));
        }
      }
      return out;
    }
    default: throw new Error(`sticky-notes: unknown mark kind ${m.kind}`);
  }
}

// ------------------------------------------------------------------ the plan
/**
 * planBoard(program, S) -> plan
 *   program = {
 *     notes: [{ id, color, text, place: { x, y, rot? } }                       // on the wall from t = -inf
 *           | { id, color, text, pad: true, peel: t, place: { x, y, rot? } }], // peeled off the pad at t, stuck at place
 *     moves: [{ id, t, to: { x, y, rot? }, kind: "hop" | "slide" }],          // re-sorts (lift -> hop/slide -> reslap)
 *     dots:  [{ on: noteId, t, u, v, color }],    // u across (-0.5..0.5), v down (0 top .. 1 bottom); t = landing
 *     marks: [{ id, kind, color, t | after: markId, gap?, pre?: true, ...geometry }],  // marker ink (pre = drawn before t=0)
 *     breezes: [{ t, dur? }],
 *   }
 *   plan = { S, notes: { id: { ...note, segs } }, order, dots, marks, strokes, breezes, events, byId, pad }
 */
export function planBoard(program, S) {
  const NS = S.note, TM = S.timing, M = S.marker;
  const pad = padPose(S);
  const notes = {}, order = [];
  const events = [];

  // pad queue: pad notes in peel order
  const padNotes = program.notes.filter((n) => n.pad).sort((a, b) => a.peel - b.peel);
  for (const n0 of program.notes) {
    const n = { ...n0, rot: n0.place.rot ?? 0, segs: [] };
    const place = { x: n0.place.x, y: n0.place.y, rot: n0.place.rot ?? 0 };
    if (n0.pad) {
      const k = padNotes.indexOf(n0);
      const prev = padNotes[k - 1];
      const visFrom = prev ? prev.peel : -Infinity;
      const prevRelease = prev ? prev.peel + TM.padPeel : -Infinity;
      const t0 = n0.peel, t1 = t0 + TM.padPeel, t2 = t1 + TM.fly, t3 = t2 + TM.slap;
      n.segs.push({ kind: "pad", t0: visFrom, t1: t0, under: prevRelease });
      n.segs.push({ kind: "padPeel", t0, t1 });
      n.segs.push({ kind: "fly", t0: t1, t1: t2, to: place });
      n.segs.push({ kind: "slap", t0: t2, t1: t3, at: place, a0: NS.approach });
      n.segs.push({ kind: "rest", t0: t3, t1: Infinity, at: place });
      events.push({ t: t0, kind: "peel", x: pad.top[0], id: n.id });
      events.push({ t: t1, kind: "fly", x: pad.top[0], dur: TM.fly, id: n.id });
      events.push({ t: t2, kind: "stick", x: place.x, id: n.id });
      events.push({ t: t2 + TM.slap * 0.3, kind: "slap", x: place.x, id: n.id, strength: 1 });
    } else {
      n.segs.push({ kind: "rest", t0: -Infinity, t1: Infinity, at: place });
    }
    notes[n.id] = n;
    order.push(n.id);
  }
  // moves (in time order per note)
  const moves = [...(program.moves ?? [])].sort((a, b) => a.t - b.t);
  for (const mv of moves) {
    const n = notes[mv.id];
    if (!n) throw new Error(`sticky-notes: move for unknown note ${mv.id}`);
    const last = n.segs[n.segs.length - 1];
    if (last.kind !== "rest" || mv.t < last.t0) throw new Error(`sticky-notes: move of ${mv.id} at ${mv.t} overlaps its previous phase`);
    const from = last.at, to = { x: mv.to.x, y: mv.to.y, rot: mv.to.rot ?? from.rot };
    const slide = mv.kind === "slide";
    const t0 = mv.t, t1 = t0 + TM.lift * (slide ? 0.7 : 1), t2 = t1 + (slide ? TM.slide : TM.hop), t3 = t2 + TM.reslap * (slide ? 0.8 : 1);
    last.t1 = t0;
    n.segs.push({ kind: "lift", t0, t1, at: from, slide });
    n.segs.push({ kind: slide ? "slide" : "hop", t0: t1, t1: t2, from, to });
    n.segs.push({ kind: "slap", t0: t2, t1: t3, at: to, a0: NS.liftAngle * (slide ? 0.55 : 0.85), small: slide });
    n.segs.push({ kind: "rest", t0: t3, t1: Infinity, at: to });
    events.push({ t: t0, kind: "lift", x: from.x, id: n.id, slide });
    events.push({ t: t1, kind: "hop", x: (from.x + to.x) / 2, dur: t2 - t1, id: n.id, slide });
    events.push({ t: t2 + (t3 - t2) * 0.3, kind: "slap", x: to.x, id: n.id, strength: slide ? 0.55 : 0.8 });
  }
  // layers: a note that lands overlapping notes already on the wall sits one layer above the highest of them
  // (z = zBase + layer * zLayer) and PRESSES them flat (their curl relaxes while covered). Departures (lifts) free a spot.
  const tl = [];
  for (const id of order) {
    const n = notes[id];
    n.press = [];
    n.segs.forEach((sg, i) => {
      if (sg.kind === "slap" || (sg.kind === "rest" && sg.t0 === -Infinity)) tl.push({ t: sg.t0, type: "arrive", n, i, order: order.indexOf(id) });
      if (sg.kind === "lift") tl.push({ t: sg.t0, type: "depart", n, i });
    });
  }
  tl.sort((a, b) => a.t - b.t || (a.type === "depart" ? -1 : 1) || (a.order ?? 0) - (b.order ?? 0));
  const cur = new Map();
  const overlaps = (p, q) => Math.abs(p.x - q.x) < NS.size * 0.94 && Math.abs(p.y - q.y) < NS.size * 0.94;
  for (const ev of tl) {
    const n = ev.n, sg = n.segs[ev.i];
    if (ev.type === "depart") {
      cur.delete(n.id);
      for (const m of order) for (const w of notes[m].press) if (w.by === n.id && w.t1 === Infinity) w.t1 = ev.t;
      continue;
    }
    const place = sg.at;
    let layer = 0;
    for (const [mid, c] of cur) if (overlaps(place, c)) {
      layer = Math.max(layer, c.layer + 1);
      notes[mid].press.push({ t0: ev.t === -Infinity ? -Infinity : ev.t + TM.slap * 0.25, t1: Infinity, by: n.id });
    }
    cur.set(n.id, { x: place.x, y: place.y, layer });
    // this arrival's slap + the rest (+ the next lift) use the layer
    for (let k = ev.i; k < n.segs.length; k++) {
      const s2 = n.segs[k];
      if (k > ev.i && (s2.kind === "hop" || s2.kind === "slide")) break;
      s2.z = NS.zBase + layer * NS.zLayer;
    }
  }
  for (const id of order) {
    const n = notes[id];
    n.segs.forEach((sg, i) => { if (sg.kind === "fly" || sg.kind === "hop" || sg.kind === "slide") sg.z = n.segs[i + 1].z; });
    n.segs.forEach((sg, i) => { if (sg.kind === "hop" || sg.kind === "slide") sg.z0 = n.segs[i - 1].z; });
  }

  // dots
  const dots = (program.dots ?? []).map((d, i) => ({ ...d, i, seed: 900 + i }));
  for (const d of dots) {
    if (!notes[d.on]) throw new Error(`sticky-notes: dot on unknown note ${d.on}`);
    events.push({ t: d.t, kind: "dot", x: notes[d.on].place.x, i: d.i });
  }

  // marks -> timed strokes
  const marks = [], byId = {};
  let tCursor = 0;
  for (const m0 of program.marks ?? []) {
    const m = { ...m0, color: m0.color ?? "black" };
    const strokes = markStrokes(m, M);
    let t = m.pre ? -1 : m.t ?? (m.after ? byId[m.after].t1 + (m.gap ?? 0.1) : tCursor + (m.gap ?? 0.1));
    m.t0 = t;
    const speed = m.speed ?? (m.kind === "text" ? M.speed * 0.8 : M.speed);
    m.strokes = strokes.map((pts, k) => {
      const len = plen(pts);
      const dur = m.pre ? 0 : Math.max(0.05, len / speed);
      const st = { pts, len, t0: m.pre ? -2 : t, t1: m.pre ? -2 : t + dur, mark: m.id, color: m.color, k };
      if (!m.pre) {
        events.push({ t, kind: "squeak", dur, len, x: pts[0][0], mark: m.id, k });
        t += dur + (k < strokes.length - 1 ? M.gap : 0);
      }
      return st;
    });
    m.t1 = m.pre ? -1 : t;
    if (!m.pre) tCursor = m.t1;
    marks.push(m);
    byId[m.id] = m;
  }

  const breezes = (program.breezes ?? []).map((b) => {
    const Bw = S.board.w, Z = S.breeze;
    const dur = b.dur ?? (Bw + 2 * Z.width) / Z.speed + 0.5;
    events.push({ t: b.t, kind: "breeze", dur });
    return { t: b.t, dur };
  });

  events.sort((a, b) => a.t - b.t);
  const strokes = marks.flatMap((m) => m.strokes);
  return { S, notes, order, dots, marks, strokes, breezes, events, byId, pad, padNotes: padNotes.map((n) => n.id) };
}

// ------------------------------------------------------------------ note state
const segAt = (n, t) => {
  for (const sg of n.segs) if (t >= sg.t0 && t < sg.t1) return sg;
  return null;
};

/**
 * noteState(plan, id, t) -> { visible, phase, pos: [x,y,z], rot: [rx, ry, rz], hinge, curl, peelS, peelA, breeze }
 *   hinge = body angle at the strip line (rad, + = away from the board), curl = resting-curl scale (1 = spec.restCurl),
 *   peelS = distance from the top where the travelling peel bend sits (null = none), peelA = peel angle.
 */
export function noteState(plan, id, t) {
  const S = plan.S, NS = S.note, TM = S.timing, n = plan.notes[id], pad = plan.pad;
  const sg = segAt(n, t);
  const st = { visible: !!sg, phase: sg?.kind ?? "none", pos: [0, 0, 0], rot: [0, 0, 0], hinge: 0, curl: 1, peelS: null, peelA: 0, breeze: 1 };
  if (!sg) return st;
  const u = clamp((t - sg.t0) / (sg.t1 - sg.t0));
  const L = NS.size, a = L * NS.strip;
  const padTop = (under) => [pad.top[0] - pad.normal[0] * under, pad.top[1] - pad.normal[1] * under, pad.top[2] - pad.normal[2] * under];
  switch (sg.kind) {
    case "pad": {
      st.pos = padTop(t < sg.under ? 0.0009 : 0); // under the live note until that note lets go
      st.rot = [-pad.lean, 0, 0]; st.curl = 0; st.breeze = 0;
      break;
    }
    case "padPeel": {
      st.pos = padTop(0); st.rot = [-pad.lean, 0, 0]; st.curl = 0; st.breeze = 0;
      const w = ease.inOutSine(u);
      st.peelS = lerp(L, a, w);
      st.peelA = NS.peelAngle * smoothstep(0, 0.3, u);
      break;
    }
    case "fly": {
      const p0 = padTop(0), to = sg.to, p1 = [to.x, to.y, sg.z];
      const w = ease.inOutSine(u), dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const hump = Math.sin(PI * w);
      st.pos = [lerp(p0[0], p1[0], w), lerp(p0[1], p1[1], w) + TM.flyArc * dist * hump * 0.5, lerp(p0[2], p1[2], w) + TM.flyOut * hump];
      const spin = hash01(id.length, Math.round(p1[0] * 100)) > 0.5 ? 1 : -1;
      st.rot = [lerp(-pad.lean, 0, ease.outCubic(u)), 0.22 * spin * Math.sin(PI * u), lerp(0, to.rot, w) + 0.25 * spin * Math.sin(PI * u)];
      const flutter = 0.22 * Math.sin(PI * u) * Math.sin(u * PI * 5);
      // continue the pad peel profile at the strip line, relaxing it into the plain hinge the slap starts from
      st.peelS = L * NS.strip;
      st.peelA = lerp(NS.peelAngle, NS.approach, ease.outCubic(u)) + flutter;
      st.peelLen = lerp(NS.peelLen, NS.bendLen, ease.inOutSine(u));
      st.roll = 1 - ease.inOutSine(u);
      st.curl = lerp(0, 0.6, u);
      st.breeze = 0;
      break;
    }
    case "slap": {
      const at = sg.at;
      st.pos = [at.x, at.y, sg.z]; st.rot = [0, 0, at.rot];
      const uF = sg.small ? 0.26 : 0.3;
      if (u < uF) {
        const q = u / uF;
        st.hinge = sg.a0 * (1 - ease.inQuad(q));
        st.curl = lerp(0.6, 0.12, q);
      } else {
        const w = (u - uF) / (1 - uF);
        st.hinge = sg.a0 * (sg.small ? 0.1 : 0.17) * Math.exp(-4 * w) * Math.abs(Math.sin((PI * w) / 0.3)) * (1 - w);
        st.curl = lerp(0.12, 1, ease.outCubic(w));
      }
      break;
    }
    case "rest": {
      st.pos = [sg.at.x, sg.at.y, sg.z]; st.rot = [0, 0, sg.at.rot];
      break;
    }
    case "lift": {
      st.pos = [sg.at.x, sg.at.y, sg.z]; st.rot = [0, 0, sg.at.rot];
      const A = NS.liftAngle * (sg.slide ? 0.55 : 1);
      st.hinge = A * ease.outCubic(u);
      st.curl = lerp(1, 1.35, u);
      break;
    }
    case "hop":
    case "slide": {
      const { from, to } = sg, slide = sg.kind === "slide";
      const w = ease.inOutSine(u), hump = Math.sin(PI * u);
      const zH = slide ? TM.slideZ : TM.hopZ;
      st.pos = [lerp(from.x, to.x, w), lerp(from.y, to.y, w) + (slide ? 0 : 0.05 * hump), lerp(sg.z0, sg.z, w) + zH * hump];
      st.rot = [0, slide ? 0 : 0.08 * hump * Math.sign(to.x - from.x || 1), lerp(from.rot, to.rot, w)];
      const A0 = NS.liftAngle * (slide ? 0.55 : 1), A1 = NS.liftAngle * (slide ? 0.55 : 0.85);
      st.hinge = lerp(A0, A1, w) + (slide ? 0.04 : 0.12) * hump * Math.sin(u * PI * 4);
      st.curl = lerp(1.35, 0.6, u);
      break;
    }
  }
  // covered by a later note: pressed flat (curl and breeze relax), released when the covering note leaves
  let pk = 0;
  for (const w of n.press) pk = Math.max(pk, smoothstep(w.t0, w.t0 + 0.12, t) * (1 - smoothstep(w.t1, w.t1 + 0.25, t)));
  if (pk > 0) { st.curl *= 1 - 0.85 * pk; st.breeze *= 1 - 0.8 * pk; }
  st.pressed = pk;
  return st;
}

/** breezeLift(plan, X, t) -> extra lift angle (rad, >= 0) for a free edge at board x = X: a travelling gust, left -> right. */
export function breezeLift(plan, X, t) {
  const Z = plan.S.breeze, W = plan.S.board.w;
  let v = 0;
  for (const b of plan.breezes) {
    if (t < b.t || t > b.t + b.dur) continue;
    const tau = t - b.t;
    const xf = -W / 2 - Z.width + Z.speed * tau;
    const g = Math.exp(-(((X - xf) / Z.width) ** 2));
    const env = smoothstep(0, 0.25, tau) * (1 - smoothstep(b.dur - 0.35, b.dur, tau));
    v += Z.amp * g * env * (0.5 + 0.5 * Math.sin(2 * PI * Z.freq * tau - (2 * PI * X) / Z.wavelength));
  }
  return v;
}

/**
 * sheetAngle(st, s, x, NS, breeze = 0) -> bend angle (rad) of the sheet at distance s from the top edge, column x
 *   (x in -W/2..W/2). 0 = flat against the surface, + = away from it. The strip (s < strip·L) is always flat.
 */
export function sheetAngle(st, s, x, NS, breeze = 0) {
  const L = NS.size, a = L * NS.strip, lb = NS.bendLen;
  if (s <= a) return 0;
  const f = (s - a) / (L - a);
  const cx = (2 * x) / L;
  let th = st.hinge * smoothstep(a, a + lb, s);
  if (st.peelS != null) {
    // travelling peel: a soft rolling bend (peelLen) plus extra roll in the lifted part (fades as roll -> 0 in flight)
    const pl = st.peelLen ?? NS.peelLen;
    th += st.peelA * smoothstep(st.peelS, st.peelS + pl, s);
    th += (st.roll ?? 1) * NS.peelRoll * clamp(st.peelA / NS.peelAngle, 0, 1.2) * Math.max(0, s - st.peelS - pl) / L;
  }
  th += NS.restCurl * st.curl * f ** NS.curlPow * (1 + NS.corner * cx * cx);
  th += breeze * st.breeze * f ** 1.3 * (1 + 0.3 * cx);
  return th;
}

/** sheetPoint(st, x, s, NS, breeze, step) -> { p: [x, y, z] local, n: [nx, ny, nz] } by integrating sheetAngle down a column. */
export function sheetPoint(st, x, s, NS, breeze = 0, step = 0.0125) {
  let y = 0, z = 0, prev = 0;
  const n = Math.max(1, Math.ceil(s / step)), ds = s / n;
  for (let i = 1; i <= n; i++) {
    const sm = (i - 0.5) * ds, th = sheetAngle(st, sm, x, NS, breeze);
    y -= ds * Math.cos(th); z += ds * Math.sin(th);
    prev = th;
  }
  const th = n ? sheetAngle(st, s, x, NS, breeze) : prev;
  return { p: [x, y, z], n: [0, Math.sin(th), Math.cos(th)], th };
}

/** dotState(d, t, drop) -> { visible, k (0 = in the air, 1 = landed), lift (m above the sheet), scale } */
export function dotState(d, t, drop = 0.16) {
  if (t < d.t - drop) return { visible: false, k: 0, lift: 0, scale: 0 };
  const k = clamp((t - (d.t - drop)) / drop);
  const land = ease.inQuad(k);
  const after = t - d.t;
  const squash = after > 0 ? 1 + 0.18 * Math.exp(-after * 18) * Math.cos(after * 40) : 1;
  return { visible: true, k: land, lift: (1 - land) * 0.12, scale: lerp(1.35, 1, land) * squash };
}

/** padUnder(plan) -> the colour name of the blank sheet under the queued pad notes. */
export function padUnder(plan) {
  const sh = plan.S.pad.sheets;
  return sh[plan.padNotes.length % sh.length];
}

/** strokeHead(st, t) -> progress 0..1 of a marker stroke at t. */
export const strokeHead = (st, t) => (st.t1 <= st.t0 ? (t >= st.t0 ? 1 : 0) : clamp((t - st.t0) / (st.t1 - st.t0)));

function pointOn(pts, u) {
  if (u <= 0) return pts[0];
  if (u >= 1) return pts[pts.length - 1];
  const L = plen(pts), target = L * u;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= target) { const k = (target - acc) / (d || 1); return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; }
    acc += d;
  }
  return pts[pts.length - 1];
}

/**
 * penAt(plan, t, { lead = .28, tail = .3 }) -> null | { x, y, z, level, color, writing }
 *   The marker pen rides the tip of the active stroke, hops between strokes (z lift), flies in before a mark and away after.
 */
export function penAt(plan, t, { lead = 0.28, tail = 0.3 } = {}) {
  const ms = plan.marks.filter((m) => !m.pre);
  const first = (m) => m.strokes[0].pts[0];
  const last = (m) => { const s = m.strokes[m.strokes.length - 1]; return s.pts[s.pts.length - 1]; };
  const out = (p, k, color) => ({ x: p[0] + k * 0.25, y: p[1] - k * 0.18, z: 0.004 + k * 0.25, level: 1 - k, color, writing: false });
  // 1) a mark being drawn wins
  const act = ms.find((m) => t >= m.t0 && t <= m.t1);
  if (act) {
    const S0 = act.strokes;
    for (let i = 0; i < S0.length; i++) {
      const st = S0[i];
      if (t >= st.t0 && t <= st.t1) { const p = pointOn(st.pts, strokeHead(st, t)); return { x: p[0], y: p[1], z: 0.003, level: 1, color: act.color, writing: true }; }
      const nx = S0[i + 1];
      if (nx && t > st.t1 && t < nx.t0) {
        const k = ease.inOutSine((t - st.t1) / (nx.t0 - st.t1));
        const a = st.pts[st.pts.length - 1], b = nx.pts[0];
        return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), z: 0.003 + 0.03 * Math.sin(PI * k), level: 1, color: act.color, writing: false };
      }
    }
    const p = last(act);
    return { x: p[0], y: p[1], z: 0.003, level: 1, color: act.color, writing: false };
  }
  // 2) between two marks drawn close together with the same pen: hop from one to the next
  let prev = null, next = null;
  for (const m of ms) {
    if (m.t1 < t && (!prev || m.t1 > prev.t1)) prev = m;
    if (m.t0 > t && (!next || m.t0 < next.t0)) next = m;
  }
  if (prev && next && next.color === prev.color && next.t0 - prev.t1 < lead + tail) {
    const k = ease.inOutSine((t - prev.t1) / (next.t0 - prev.t1)), a = last(prev), b = first(next);
    return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), z: 0.003 + 0.05 * Math.sin(PI * k), level: 1, color: prev.color, writing: false };
  }
  // 3) flying in before a mark / away after one
  if (next && t >= next.t0 - lead) return out(first(next), 1 - ease.outCubic(clamp((t - (next.t0 - lead)) / lead)), next.color);
  if (prev && t <= prev.t1 + tail) return out(last(prev), ease.inCubic(clamp((t - prev.t1) / tail)), prev.color);
  return null;
}

// ------------------------------------------------------------------ camera framing
/**
 * boardShot(box, { fov, dir, safe, minDist, maxDist, aspect = 16/9, z = [0, 0.06] }) -> { pos, target, fov }
 *   box = [x0, y0, x1, y1] (board metres). Looks at the box centre from direction `dir` (slightly right and above, so
 *   curls and shadows read) and backs off until all 8 corners (z range `z`) sit inside |NDC| <= safe.
 */
export function boardShot(box, o = {}) {
  const fov = o.fov ?? 30, dir = o.dir ?? [0.16, 0.13, 1], safe = o.safe ?? 0.9, aspect = o.aspect ?? 16 / 9;
  const z = o.z ?? [0, 0.06];
  const l = Math.hypot(...dir), D = dir.map((v) => v / l);
  const target = [(box[0] + box[2]) / 2 + (o.shift?.[0] ?? 0), (box[1] + box[3]) / 2 + (o.shift?.[1] ?? 0), 0];
  const pts = boxCorners([box[0], box[1], z[0]], [box[2], box[3], z[1]]);
  const fits = (d) => screenExtent({ pos: target.map((v, i) => v + D[i] * d), target, fov, roll: 0 }, pts, { aspect }).m <= safe;
  let lo = o.minDist ?? 1.5, hi = o.maxDist ?? 14;
  if (fits(lo)) hi = lo;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return { pos: target.map((v, i) => +(v + D[i] * hi).toFixed(4)), target: target.map((v) => +v.toFixed(4)), fov };
}

/** shotFill(shot, box, fov) -> the fraction of the frame height the box spans (to check the subject stays large). */
export function shotFill(shot, box, o = {}) {
  const cam = sampleCameraKeys([{ t: 0, ...shot }], 0, { fov: shot.fov ?? 30 });
  const e = screenExtent(cam, boxCorners([box[0], box[1], 0], [box[2], box[3], 0]), { aspect: o.aspect ?? 16 / 9 });
  return { w: (e.x[1] - e.x[0]) / 2, h: (e.y[1] - e.y[0]) / 2 };
}

// ------------------------------------------------------------------ sound
/** stickyVoices(sound = spec.sound) -> voices for kit/schedule.scoreFromEvents(plan.events, voices). */
export function stickyVoices(Sd) {
  return {
    peel: () => [{ type: "paper", dur: 0.42, pitch: Sd.peel.pitch, density: Sd.peel.density, gain: Sd.peel.gain }],
    fly: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.3, e.dur), pitch: Sd.hop.pitch * 0.8, gain: Sd.hop.gain * 1.6 }],
    lift: (e) => [{ type: "paper", dur: e.slide ? 0.12 : 0.18, pitch: Sd.lift.pitch, density: Sd.lift.density, gain: Sd.lift.gain * (e.slide ? 0.6 : 1) }],
    hop: (e) => [{ type: "whoosh", dir: "in", dur: Math.max(0.25, e.dur), pitch: Sd.hop.pitch, gain: Sd.hop.gain * (e.slide ? 0.6 : 1) }],
    stick: () => [{ type: "click", pitch: Sd.slap.clickPitch * 1.6, gain: Sd.slap.clickGain * 0.5 }],
    slap: (e) => [
      { type: "thud", dur: 0.14, pitch: Sd.slap.thudPitch, gain: Sd.slap.thudGain * e.strength },
      { type: "click", pitch: Sd.slap.clickPitch, gain: Sd.slap.clickGain * e.strength },
    ],
    dot: () => [{ type: "pop", dur: 0.07, pitch: Sd.dot.pitch, gain: Sd.dot.gain }, { type: "click", pitch: 1.3, gain: Sd.dot.tickGain, offset: 0.004 }],
    squeak: (e) => [
      { type: "penScratch", dur: Math.max(0.08, e.dur), pitch: Sd.squeak.felt, speed: 1.2, gain: Sd.squeak.feltGain },
      { type: "servo", dur: Math.min(0.3, Math.max(0.08, e.dur)), hz: Sd.squeak.hz, hz2: Sd.squeak.hz2, grit: Sd.squeak.grit, gain: Sd.squeak.gain },
    ],
    breeze: (e) => [
      { type: "whoosh", dir: "in", dur: e.dur, pitch: Sd.breeze.pitch, gain: Sd.breeze.gain },
      { type: "paper", dur: e.dur * 0.8, pitch: 1.3, density: 0.3, gain: Sd.breeze.rustle, offset: e.dur * 0.15 },
    ],
  };
}

/** malletPhrase(t, notes, { step, root, gain, dur }) -> SCORE entries for the light mallet theme (chime = bar partials). */
export function malletPhrase(t, notes, o = {}) {
  const step = o.step ?? 0.16, root = o.root ?? 0.5, gain = o.gain ?? 0.16, dur = o.dur ?? 0.7;
  return notes.map((n, i) => ({ t: +(t + i * step).toFixed(4), type: "chime", dur, pitch: +(root * 2 ** (n / 12)).toFixed(5), gain: gain * (i === notes.length - 1 ? 1 : 0.8), pan: -0.15 + 0.1 * i, seed: 700 + Math.round(t * 100) + i }));
}
