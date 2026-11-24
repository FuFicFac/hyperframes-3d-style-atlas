// styles/dollhouse-cutaway/rooms.js — the room-graph planner for "Dollhouse Cutaway". Pure data in, pure data out:
// no THREE, no window, no DOM; imports only kit/time.js and kit/pathmath.js, so scene.config.js (Node: render-sfx,
// export-spec) and style.js (browser) read the SAME plan. Everything on screen and every sound cue derives from it.
//
//   houseLayout(spec.house)                 -> layout: room boxes, lamp points, track points, chimney, sign, subject box
//   planRoute(layout, spec.route, courier)  -> plan:
//     plan.lightAt(i, t)      light level of room i (0 dark .. 1 lit .. >1 finale); plan.exteriorAt(t); plan.nightAt(t)
//     plan.courierAt(t)       { pieces[4] {p, s, rgb, vis}, block {vis, p, squash}, orb {vis, p, scale, rgb, bubble}, halo {p, k} }
//     plan.actionsAt(t)       per-room mini-animation values (stamp, blade, books[4], press[4], gear, lens, tick, pump)
//     plan.frontAt(t)         front-wall open angle (rad); plan.doorAt(t) front door 0..1; plan.labelAt(t) {index, flip}
//     plan.events             [{ t, kind, room?, k?, x, dur? }] -> SCORE via kit/schedule.scoreFromEvents
//     plan.legs, plan.stops, plan.finaleOn, plan.labels, plan.switches
// Coordinates: x right, y up, z toward the viewer. The open front of the house is the plane z = layout.zF.
import { clamp, lerp, smoothstep, ease } from "../../kit/time.js";
import { arcTable, filletPath } from "../../kit/pathmath.js";

export const hexRgb = (h) => {
  const n = parseInt(String(h).slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const mixRgb = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const mixHex = (a, b, k) => mixRgb(hexRgb(a), hexRgb(b), k);
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const hop = (u, h) => 4 * h * clamp(u) * (1 - clamp(u));

/** pulse(t, at, up, down): 0 -> 1 reached exactly AT `at` (the contact / sound moment) -> back to 0. */
export function pulse(t, at, up = 0.08, down = 0.24) {
  if (t <= at - up || t >= at + down) return 0;
  if (t < at) return ease.outQuad((t - (at - up)) / up);
  return 1 - ease.inOutSine((t - at) / down);
}
/** loopPulse(t, start, period, up, down): the same pulse repeating every `period` s from `start` (finale loops). */
export function loopPulse(t, start, period, up = 0.08, down = 0.24) {
  const u = t - start;
  if (u < -up) return 0;
  const m = ((u + up) % period) - up;
  return pulse(m, 0, up, down);
}

// ---------------------------------------------------------------- layout
export function houseLayout(H) {
  const { cols, floors, roomW, roomH, depth, wall } = H;
  const W = cols * roomW + (cols + 1) * wall;
  const base = H.plinth.h;
  const zB = -depth / 2, zF = depth / 2;
  const colX = (c) => -W / 2 + wall + c * (roomW + wall) + roomW / 2;
  const floorY = (f) => base + wall + f * (roomH + wall);
  const topY = floorY(floors); // top of the top slab
  const rooms = H.rooms.map((r, i) => {
    const cx = colX(r.col), fy = floorY(r.floor);
    const lampY = fy + roomH - H.lampDrop - 0.12;
    return { ...r, i, cx, fy, x0: cx - roomW / 2, x1: cx + roomW / 2, y1: fy + roomH, lamp: [cx + (r.lampDx ?? 0), lampY, H.lampZ] };
  });
  const byId = Object.fromEntries(rooms.map((r) => [r.id, r]));
  const at = (id, dx, y, z = H.trackZ) => { const r = byId[id]; return [r.cx + dx, r.fy + y, z]; };
  const ans = byId.answer;
  const chimX = ans.cx + ans.tube, chimTop = topY + H.chimney.top;
  const roofFront = zF + H.roof.front;
  const sign = { c: [0, topY + H.sign.y, roofFront + H.sign.z], w: H.sign.w, h: H.sign.h };
  const hover = [chimX + H.hover[0], topY + H.hover[1], H.hover[2]];
  const xOut = W / 2 + H.plinth.out;
  const box = [[-xOut, 0, zB - wall - H.plinth.back], [xOut, Math.max(chimTop, sign.c[1] + sign.h / 2), zF + H.plinth.out]];
  const signBox = [[-sign.w / 2, sign.c[1] - sign.h / 2, sign.c[2]], [sign.w / 2, sign.c[1] + sign.h / 2, sign.c[2]]];
  return {
    H, W, base, zB, zF, wall, roomW, roomH, topY, rooms, byId, at, colX, floorY,
    trackZ: H.trackZ, chimX, chimTop, chimZ: H.chimney.z, roofFront, sign, signBox, hover, box,
    doorX: byId.mail.cx + H.door.dx,
  };
}

/** plan(spec) -> { layout, plan }: the whole thing from a STYLE_SPEC (what scene.config.js and style.js call). */
export function plan(spec) {
  const layout = houseLayout(spec.house);
  return { layout, plan: planRoute(layout, spec.route, { ...spec.courier, palette: spec.palette, levels: spec.levels, light: spec.light }) };
}

// ---------------------------------------------------------------- route plan
// C = { ...spec.courier, palette, levels, light }
export function planRoute(L, R, C) {
  const H = L.H, tok = C.token, half = tok / 2, sp = tok + C.gap, r = C.orb / 2;
  const S = Object.fromEntries(R.stops.map((s, k) => [s.room, { ...s, k, i: L.byId[s.room].i }]));
  const mail = L.byId.mail, tokR = L.byId.tokens, lib = L.byId.library, work = L.byId.workshop, chk = L.byId.check, ans = L.byId.answer;
  const tz = L.trackZ;
  const sy = (room, extra) => room.fy + room.spot[1] + extra; // courier centre height on a room's work surface
  const events = [];
  const ev = (t, kind, o = {}) => events.push({ t, kind, x: o.x ?? 0, ...o });
  const PAL = C.palette;
  const tokenRgb = (j) => hexRgb(PAL.tokens[j]);

  // ---- entry: the parcel (a 2x2 block of the four pieces) hops along the plinth, through the door, onto the mail counter
  const E = R.entry;
  const blockY0 = L.base + tok;
  const ePts = [
    [L.doorX - 2.7, blockY0, L.zF + 0.9], [L.doorX - 1.35, blockY0, L.zF + 0.9], [L.doorX, blockY0, L.zF + 0.9],
    [L.doorX, mail.fy + tok, tz], [mail.cx + mail.spot[0], sy(mail, tok), tz],
  ];
  const eT = [E.hops[0], E.hops[1], E.hops[2], E.door, E.end];
  const eHop = [C.hop, C.hop, 0.12, 0.55];
  const entryAt = (t) => {
    if (t <= eT[0]) return ePts[0];
    for (let k = 0; k < 4; k++) {
      if (t <= eT[k + 1]) {
        const u = (t - eT[k]) / (eT[k + 1] - eT[k]);
        const p = lerp3(ePts[k], ePts[k + 1], k === 2 ? ease.inOutSine(u) : u);
        return [p[0], p[1] + hop(u, eHop[k]), p[2]];
      }
    }
    return ePts[4];
  };
  ev(E.hops[1], "hop", { x: ePts[1][0] }); ev(E.hops[2], "hop", { x: ePts[2][0] }); ev(E.end, "land", { x: ePts[4][0] });
  ev(R.door.open, "door", { x: L.doorX }); ev(R.door.shut, "doorShut", { x: L.doorX });

  // ---- mail -> tokens: the parcel rides the belt
  const blockT = [tokR.cx + tokR.spot[0], sy(tokR, tok), tz];
  const belt = { t0: S.mail.leave, t1: S.tokens.arrive, a: ePts[4], b: blockT };
  ev(belt.t0, "move", { dur: belt.t1 - belt.t0, x: 0, room: "mail" });

  // ---- tokens room: three chops; the pieces leave the block one by one into a row (lead = piece 0, rightmost)
  const off = [[half, -half], [half, half], [-half, -half], [-half, half]];
  const chopT = S.tokens.actions.map((a) => S.tokens.arrive + a.at);
  const chopOf = [0, 1, 2, 2];
  const slotT = (j) => [tokR.cx + tokR.row - j * sp, sy(tokR, half), tz];

  // ---- train legs (pieces follow the lead along the track, `sp` apart in arc length)
  const yT = sy(tokR, half), yL = sy(lib, half), yW = sy(work, half);
  const t1 = arcTable(filletPath([
    slotT(3), slotT(0), [tokR.cx + H.riserDx, yT, tz], [tokR.cx + H.riserDx, tokR.fy + H.pipeHigh, tz],
    [lib.cx + H.dropDx, lib.fy + H.pipeHigh, tz], [lib.cx + H.dropDx, yL, tz], [lib.cx + lib.row, yL, tz],
  ], 0.35));
  const leg1 = { t0: S.tokens.leave, t1: S.library.arrive, s0: 3 * sp, s1: t1.length };
  const liftTop = [work.cx + H.liftDx, yW, tz];
  const t2 = arcTable(filletPath([
    [lib.cx + lib.row - 3 * sp, yL, tz], [lib.cx + lib.row, yL, tz], [lib.cx + H.liftDx, yL, tz], liftTop, [work.cx + work.walkTo, yW, tz],
  ], 0.3));
  const sA = t2.project(liftTop);
  const walk = [S.workshop.arrive + S.workshop.walk[0], S.workshop.arrive + S.workshop.walk[1]];
  const leg2 = { t0: S.library.leave, t1: S.workshop.arrive, s0: 3 * sp, s1: sA };
  const leadS2 = (t) => (t < leg2.t1 ? lerp(leg2.s0, leg2.s1, ease.inOutSine((t - leg2.t0) / (leg2.t1 - leg2.t0)))
    : lerp(sA, t2.length, clamp((t - walk[0]) / (walk[1] - walk[0]))));
  ev(leg1.t0, "move", { dur: leg1.t1 - leg1.t0, x: 2, room: "tokens" });
  ev(leg2.t0, "move", { dur: leg2.t1 - leg2.t0, x: 5, room: "library", lift: true });
  ev(walk[0], "move", { dur: walk[1] - walk[0], x: 5, room: "workshop" });
  // one press per station, the moment the lead token is under it
  const pressT = work.stations.map((dx) => {
    const s = t2.project([work.cx + dx, yW, tz]);
    return walk[0] + ((s - sA) / (t2.length - sA)) * (walk[1] - walk[0]);
  });
  const libBookT = S.library.actions.map((a) => S.library.arrive + a.at);

  // ---- fuse: the four tokens become the answer orb at the end of the belt
  const fuseT = S.workshop.arrive + S.workshop.actions.find((a) => a.kind === "fuse").at;
  const F = [work.cx + work.walkTo, sy(work, r), tz];

  // ---- orb legs
  const chkP = [chk.cx + chk.spot[0], sy(chk, r), tz];
  const tickT = S.check.arrive + S.check.actions[0].at;
  const hopPts = [chkP, [chk.cx + H.steps[0][0], chk.fy + H.steps[0][1] + r, tz], [chk.cx + H.steps[1][0], chk.fy + H.steps[1][1] + r, tz], [ans.cx + ans.spot[0], sy(ans, r), tz]];
  const hopH = [0.45, 0.4, 0.75];
  const hopLen = hopPts.slice(1).map((p, k) => Math.hypot(p[0] - hopPts[k][0], p[1] - hopPts[k][1]) + 1.2);
  const hopTot = hopLen.reduce((a, b) => a + b, 0);
  const hopT = [S.check.leave];
  hopLen.forEach((l) => hopT.push(hopT[hopT.length - 1] + ((S.answer.arrive - S.check.leave) * l) / hopTot));
  hopT.slice(1).forEach((t, k) => ev(t, "bounce", { x: hopPts[k + 1][0], k }));
  const pumpT = S.answer.actions.map((a) => S.answer.arrive + a.at);
  const X = R.exit;
  const tubeBase = [L.chimX, sy(ans, r), tz];
  const tube = arcTable([tubeBase, [L.chimX, L.topY - 0.25, tz], [L.chimX, L.topY + 0.35, L.chimZ], [L.chimX, L.chimTop + r + 0.05, L.chimZ]]);
  const orbAt = (t) => {
    if (t < S.workshop.leave) return F;
    if (t < S.check.arrive) {
      const u = ease.inOutSine((t - S.workshop.leave) / (S.check.arrive - S.workshop.leave));
      return [lerp(F[0], chkP[0], u), lerp(F[1], chkP[1], u) + hop(u, 0.25), tz];
    }
    if (t < S.check.leave) return chkP;
    if (t < S.answer.arrive) {
      for (let k = 0; k < 3; k++) if (t <= hopT[k + 1]) {
        const u = (t - hopT[k]) / (hopT[k + 1] - hopT[k]);
        const p = lerp3(hopPts[k], hopPts[k + 1], u);
        return [p[0], p[1] + hop(u, hopH[k]), tz];
      }
    }
    if (t < S.answer.leave) return hopPts[3];
    if (t < X.tube) return lerp3(hopPts[3], tubeBase, ease.inOutSine((t - S.answer.leave) / (X.tube - S.answer.leave)));
    if (t < X.chimney) return tube.at(tube.length * ease.inQuad((t - X.tube) / (X.chimney - X.tube))).p;
    const top = tube.at(tube.length).p;
    if (t < X.settle) {
      const u = (t - X.chimney) / (X.settle - X.chimney);
      const p = lerp3(top, L.hover, ease.outCubic(u));
      return [p[0], p[1] + hop(u, 0.5), p[2]];
    }
    const b = t - X.settle;
    return [L.hover[0], L.hover[1] + 0.12 * Math.sin(b * 2.6), L.hover[2]];
  };
  ev(S.workshop.leave, "move", { dur: S.check.arrive - S.workshop.leave, x: 1, room: "workshop", orb: true });
  ev(S.answer.leave, "roll", { x: L.chimX });
  ev(X.tube, "launch", { x: L.chimX, dur: X.chimney - X.tube });
  ev(X.chimney, "emerge", { x: L.chimX });
  ev(X.settle, "bubble", { x: L.hover[0] });

  // ---- lights
  const visited = C.levels.visited, finaleL = C.levels.finale;
  const ansCol = ans.col, ansFloor = ans.floor;
  const finaleOn = L.rooms.map((rm) => R.finale.t + (Math.abs(rm.col - ansCol) + Math.abs(rm.floor - ansFloor)) * R.finale.step);
  const stopOf = L.rooms.map((rm) => S[rm.id]);
  const lightAt = (i, t) => {
    const s = stopOf[i];
    let lv = 0;
    const on = s.arrive + R.lightDelay;
    if (t > on) {
      const u = clamp((t - on) / R.lightRamp);
      const dip = 1 - 0.5 * Math.exp(-(((t - on - R.lightRamp * 0.55) / 0.03) ** 2)); // a switch-on flicker
      lv = ease.outQuad(u) * dip;
      if (t > s.leave) lv = lerp(1, visited, smoothstep(s.leave, s.leave + R.dimDur, t));
    }
    return lerp(lv, finaleL, smoothstep(finaleOn[i], finaleOn[i] + 0.22, t));
  };
  L.rooms.forEach((rm, i) => {
    ev(stopOf[i].arrive + R.lightDelay, "light", { room: rm.id, k: stopOf[i].k, x: rm.cx });
    ev(finaleOn[i], "ripple", { room: rm.id, k: i, x: rm.cx });
  });
  ev(R.finale.t, "finale", { x: 0 });
  const exteriorAt = (t) => lerp(C.light.exterior, C.light.exteriorFinale, smoothstep(R.finale.t, R.finale.t + 0.6, t));
  const nightAt = (t) => smoothstep(X.tube, R.finale.t + 0.5, t);

  // ---- the front wall and the door
  const FR = R.front;
  ev(FR.t0, "frontOpen", { dur: FR.t1 - FR.t0 }); ev(FR.t1, "frontStop", {});
  const frontAt = (t) => {
    const u = clamp((t - FR.t0) / (FR.t1 - FR.t0));
    const k = ease.inOutCubic(u);
    const settle = t > FR.t1 ? 0.035 * Math.exp(-(t - FR.t1) * 7) * Math.sin((t - FR.t1) * 22) : 0;
    return H.front.angle * (k - settle);
  };
  const D = R.door;
  const doorAt = (t) => ease.inOutSine(clamp((t - D.open) / D.dur)) * (1 - ease.inOutSine(clamp((t - (D.shut - D.dur)) / D.dur)));

  // ---- actions (mini-animations), plus their sound events
  const stampT = S.mail.actions.map((a) => S.mail.arrive + a.at);
  stampT.forEach((t) => ev(t, "stamp", { x: mail.cx }));
  chopT.forEach((t, k) => ev(t, "chop", { x: tokR.cx - 0.85, k }));
  libBookT.forEach((t, k) => ev(t, "book", { x: lib.cx, k }));
  pressT.forEach((t, k) => ev(t, "press", { x: work.cx + work.stations[k], k }));
  ev(fuseT, "fuse", { x: F[0] });
  ev(tickT, "tick", { x: chk.cx });
  pumpT.forEach((t, k) => ev(t, "pump", { x: ans.cx, k }));
  const per = R.finale.period, fOn = (id) => finaleOn[L.byId[id].i];
  const fin = (id, t, k = 0, n = 1, up, down) => loopPulse(t, fOn(id) + (k * per) / n, per, up, down);
  const actionsAt = (t) => {
    const mx = (a, b) => Math.max(a, b);
    const gearT = Math.max(0, Math.min(t, S.workshop.leave) - S.workshop.arrive) + Math.max(0, t - fOn("workshop"));
    const lensIn = smoothstep(S.check.arrive + 0.05, tickT - 0.1, t) * (1 - smoothstep(tickT + 0.35, S.check.leave, t));
    return {
      mail: { stamp: mx(stampT.reduce((a, s) => mx(a, pulse(t, s, 0.1, 0.22)), 0), fin("mail", t, 0, 1, 0.1, 0.22)) },
      tokens: { blade: mx(chopT.reduce((a, s) => mx(a, pulse(t, s, 0.07, 0.18)), 0), fin("tokens", t, 0, 1, 0.07, 0.18)) },
      library: { books: libBookT.map((s, k) => mx(pulse(t, s, 0.1, 0.5), fin("library", t, k, 4, 0.1, 0.3))) },
      workshop: { press: pressT.map((s, k) => mx(pulse(t, s, 0.08, 0.2), fin("workshop", t, k, 4, 0.08, 0.16))), gear: gearT },
      check: { lens: mx(lensIn, 0), tick: smoothstep(tickT - 0.02, tickT + 0.08, t), tickFlash: pulse(t, tickT, 0.02, 0.5), scan: fin("check", t, 0, 1, 0.1, 0.3) },
      answer: { pump: mx(pumpT.reduce((a, s) => mx(a, pulse(t, s, 0.08, 0.18)), 0), fin("answer", t, 0, 1, 0.08, 0.2)) },
    };
  };

  // ---- the courier
  const parcelRgb = hexRgb(PAL.parcel);
  const courierAt = (t) => {
    const pieces = [0, 1, 2, 3].map((j) => ({ p: [0, 0, 0], s: [tok, tok, tok], rgb: parcelRgb, vis: true }));
    const block = { vis: false, p: [0, 0, 0], squash: 1 };
    const orb = { vis: false, p: F, scale: 0, rgb: hexRgb(PAL.answer), bubble: 0 };
    let halo = { p: [0, 0, 0], k: 1 };
    const setBlock = (c, squash = 1) => {
      block.vis = true; block.p = c; block.squash = squash;
      pieces.forEach((pc, j) => { pc.p = [c[0] + off[j][0], c[1] - tok + (tok + off[j][1]) * squash, c[2]]; pc.s = [tok * (1 + (1 - squash) * 0.5), tok * squash, tok]; });
      halo = { p: c, k: 1 };
    };
    if (t < S.mail.leave) {
      const stamp = stampT.reduce((a, s) => Math.max(a, pulse(t, s, 0.1, 0.22)), 0);
      setBlock(t < E.end ? entryAt(t) : ePts[4], 1 - 0.2 * stamp * (t > S.mail.arrive ? 1 : 0));
    } else if (t < S.tokens.arrive) {
      setBlock(lerp3(belt.a, belt.b, ease.inOutSine((t - belt.t0) / (belt.t1 - belt.t0))));
    } else if (t < S.tokens.leave) {
      setBlock(blockT);
      let any = false;
      pieces.forEach((pc, j) => {
        const c0 = chopT[chopOf[j]];
        const u = clamp((t - c0) / 0.26);
        if (u <= 0) { any = true; return; }
        const a = [blockT[0] + off[j][0], blockT[1] - tok + (tok + off[j][1]), tz];
        const b = slotT(j);
        const p = lerp3(a, b, ease.inOutCubic(u));
        pc.p = [p[0], p[1] + hop(u, 0.3), p[2]];
        pc.s = [tok, tok, tok];
        pc.rgb = mixRgb(parcelRgb, tokenRgb(j), ease.outQuad(u));
      });
      block.vis = any && t < chopT[0] + 0.05;
      const n = pieces.length;
      halo = { p: [pieces.reduce((a, q) => a + q.p[0], 0) / n, pieces.reduce((a, q) => a + q.p[1], 0) / n, tz], k: 1 };
    } else if (t < fuseT) {
      let sLead, table;
      if (t < S.library.arrive) { table = t1; sLead = lerp(leg1.s0, leg1.s1, ease.inOutSine((t - leg1.t0) / (leg1.t1 - leg1.t0))); }
      else if (t < S.library.leave) { table = t1; sLead = leg1.s1; }
      else { table = t2; sLead = leadS2(t); }
      pieces.forEach((pc, j) => {
        pc.p = table.at(sLead - j * sp).p.slice();
        pc.rgb = tokenRgb(j);
        if (t >= S.library.arrive && t < S.library.leave) {
          const b = pulse(t, libBookT[j], 0.12, 0.4);
          pc.p[1] += 0.32 * b; pc.rgb = mixRgb(pc.rgb, [1, 1, 1], 0.7 * b);
        }
        if (t >= walk[0]) {
          pressT.forEach((ps, k) => {
            const f = pulse(t, ps + 0.02, 0.04, 0.45);
            if (f > 0) pc.rgb = mixRgb(pc.rgb, hexRgb(H.layers[k]), 0.85 * f);
          });
          // pressed flat for a moment as its station stamps
          const under = pressT.findIndex((ps, k) => Math.abs(pc.p[0] - (work.cx + work.stations[k])) < 0.25 && Math.abs(t - ps) < 0.2);
          if (under >= 0) { const q = pulse(t, pressT[under], 0.08, 0.2); pc.s = [tok * (1 + 0.25 * q), tok * (1 - 0.35 * q), tok]; pc.p[1] -= tok * 0.175 * q; }
        }
      });
      const n = pieces.length;
      halo = { p: [pieces.reduce((a, q) => a + q.p[0], 0) / n, pieces.reduce((a, q) => a + q.p[1], 0) / n, tz], k: 1 };
    } else {
      // fuse -> orb
      const u = clamp((t - fuseT) / 0.24);
      pieces.forEach((pc, j) => {
        const a = t2.at(t2.length - j * sp).p;
        pc.p = lerp3(a, F, ease.inCubic(u));
        pc.rgb = mixRgb(tokenRgb(j), [1, 1, 1], u);
        const k = 1 - ease.inQuad(u);
        pc.s = [tok * k, tok * k, tok * k];
        pc.vis = u < 1;
      });
      orb.vis = true;
      orb.p = orbAt(t);
      const grow = t < fuseT + 0.12 ? 0 : ease.outBack(clamp((t - fuseT - 0.12) / 0.3));
      const pump = pumpT.reduce((a, s) => Math.max(a, pulse(t, s, 0.08, 0.18)), 0);
      orb.scale = grow * (1 - 0.18 * pump * (t < S.answer.leave ? 1 : 0));
      orb.squash = 1 - 0.25 * pump * (t < S.answer.leave ? 1 : 0);
      const flash = pulse(t, tickT, 0.02, 0.6);
      orb.rgb = mixRgb(hexRgb(PAL.answer), hexRgb(PAL.tick), 0.75 * flash);
      orb.bubble = ease.outBack(clamp((t - (X.settle - 0.3)) / 0.45));
      // inside the tube / roof the orb (and its halo) is hidden by the house; the halo fades there too
      const hidden = t > X.tube + 0.12 && t < X.chimney - 0.04;
      halo = { p: orb.p, k: hidden ? 0 : 1 + orb.bubble * 0.6 };
    }
    return { pieces, block, orb, halo };
  };

  // ---- labels: one per stop; each flips over when the courier heads for the next room
  const switches = R.stops.slice(1).map((s) => s.arrive - R.labelLead);
  const labelAt = (t) => {
    let index = 0;
    switches.forEach((s, k) => { if (t >= s) index = k + 1; });
    let flip = 1;
    const fd = R.flip;
    switches.forEach((s) => {
      // never blank: the old card folds to 25 % height, the new one opens from 25 % (one squashed frame, no empty sign)
      if (t > s - fd && t < s) flip = Math.min(flip, 1 - 0.75 * ease.inQuad((t - (s - fd)) / fd));
      if (t >= s && t < s + fd) flip = Math.min(flip, 0.25 + 0.75 * ease.outBack((t - s) / fd, 1.2));
    });
    return { index, flip, text: R.labels[index] };
  };
  switches.forEach((s, k) => ev(s, "flip", { k }));

  events.sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : 1));
  return {
    events, stops: S, finaleOn, labels: R.labels, switches, chopT, pressT, fuseT, tickT, pumpT, stampT, libBookT, walk, hopT,
    legs: { belt, leg1, leg2, t1Length: t1.length, t2Length: t2.length },
    lightAt, exteriorAt, nightAt, frontAt, doorAt, actionsAt, courierAt, labelAt, orbAt,
  };
}
