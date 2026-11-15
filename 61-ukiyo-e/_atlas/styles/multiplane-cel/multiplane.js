// styles/multiplane-cel/multiplane.js — the shot plan for a multiplane camera. Pure, Node-safe: no THREE, no window,
// no DOM; imports only kit/time.js. style.js reads it for the picture, scene.config.js reads it for SCORE and the
// framing gates, so the camera, the sliding tray, the cel bird's drawings and every sound come from one schedule.
//
// Geometry (see spec.js): panes are horizontal, stacked up +Y from rig.baseY by rig.gap; the reference lens sits at
// (0, rig.lensY, 0) looking straight down with the top of the picture toward -Z. layout(S).levels[i] gives each pane's
// height, its distance d0 from the reference lens and the half size (halfW, halfH) of the reference frame at that
// depth: a picture coordinate (u, v) on pane i is world (u * halfW, -v * halfH). Painting every layer in (u, v) makes
// the stack look like ONE flat picture from the lens; moving the camera down the stack makes it part.
//
// Camera keys: { t, target: [x,y,z], az, el, dist, ease } — spherical around the target (el = PI/2 is straight down,
// az = 0 puts picture-up at -Z). up = (-sin el sin az, cos el, -sin el cos az) is never parallel to the view, so the
// camera can turn from straight down to a three-quarter view without the lookAt flip a fixed world-up would give.
// Shorthand { t, pic: [x, z, dist] } = straight down at the bottom pane from height dist.
import { clamp, lerp, toEase, smoothstep } from "../../kit/time.js";

const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** layout(S) -> { lens, levels: [{ i, id, y, d0, halfW, halfH, margin, full }], tanH, aspect } from STYLE_SPEC */
export function layout(S) {
  const R = S.rig, tanH = Math.tan((S.picture.fov * DEG) / 2), aspect = S.picture.aspect;
  const levels = S.layers.map((L, i) => {
    const y = R.baseY + i * R.gap, d0 = R.lensY - y, halfH = d0 * tanH;
    return { i, id: L.id, y, d0, halfH, halfW: halfH * aspect, margin: L.margin ?? 1, full: !!L.full, px: L.px };
  });
  return { lens: [0, R.lensY, 0], levels, tanH, aspect, byId: Object.fromEntries(levels.map((l) => [l.id, l])) };
}

/** camFrom({ target, az, el, dist }) -> { pos, target, up, forward } */
export function camFrom(k) {
  const ce = Math.cos(k.el), se = Math.sin(k.el), sa = Math.sin(k.az), ca = Math.cos(k.az);
  const pos = [k.target[0] + k.dist * ce * sa, k.target[1] + k.dist * se, k.target[2] + k.dist * ce * ca];
  const up = [-se * sa, ce, -se * ca];
  const forward = [-ce * sa, -se, -ce * ca];
  return { pos, target: k.target.slice(), up, forward };
}

/** project(cam, p, { fov, aspect }) -> [ndcX, ndcY, depth] for a camFrom() pose (depth <= 0 = behind) */
export function project(cam, p, { fov = 36, aspect = 16 / 9 } = {}) {
  const right = cross(cam.forward, cam.up), rel = sub(p, cam.pos);
  const z = dot(rel, cam.forward), t = Math.tan((fov * DEG) / 2);
  return [dot(rel, right) / (z * t * aspect), dot(rel, cam.up) / (z * t), z];
}

/**
 * fitKey(points, { az, el, fov, aspect, fill = .9, window = { x0:-1, x1:1, y0:-1, y1:1 } }) -> { target, az, el, dist }
 *   A three-quarter key where the points fill `fill` of the window on the limiting axis, centred in it.
 */
export function fitKey(points, o) {
  const { az, el, fov = 36, aspect = 16 / 9, fill = 0.9 } = o;
  const W = { x0: -1, x1: 1, y0: -1, y1: 1, ...(o.window ?? {}) };
  const c = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  let target = c, dist = 10;
  const ext = (tg, d) => {
    const cam = camFrom({ target: tg, az, el, dist: d });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) { const q = project(cam, p, { fov, aspect }); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    return { x0, x1, y0, y1, cam };
  };
  for (let iter = 0; iter < 6; iter++) {
    let lo = 0.5, hi = 200;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2, e = ext(target, mid);
      const s = Math.max((e.x1 - e.x0) / (W.x1 - W.x0), (e.y1 - e.y0) / (W.y1 - W.y0));
      if (s > fill) lo = mid; else hi = mid;
    }
    dist = hi;
    const e = ext(target, dist), cam = e.cam, right = cross(cam.forward, cam.up);
    const t = Math.tan((fov * DEG) / 2), depth = dot(sub(target, cam.pos), cam.forward);
    const dx = ((e.x0 + e.x1) / 2 - (W.x0 + W.x1) / 2) * depth * t * aspect;
    const dy = ((e.y0 + e.y1) / 2 - (W.y0 + W.y1) / 2) * depth * t;
    target = [target[0] + right[0] * dx + cam.up[0] * dy, target[1] + right[1] * dx + cam.up[1] * dy, target[2] + right[2] * dx + cam.up[2] * dy];
  }
  return { target, az, el, dist: +dist.toFixed(5) };
}

/**
 * createPlan(S, { keys, slide: { level, du, t0, t1 }, bird: { u0, au, v0, av, period, turnAt }, end })
 *   -> plan with cameraAt(t), slideAt(t) (metres), birdAt(t), flapTimes(), closeness(t), events(), layout
 */
export function createPlan(S, o) {
  const lay = layout(S), base = S.rig.baseY;
  const keys = o.keys.map((k) => (k.pic
    ? { t: k.t, target: [k.pic[0], base, k.pic[1]], az: 0, el: Math.PI / 2, dist: k.pic[2], ease: k.ease ?? "inOutCubic" }
    : { ease: "inOutCubic", ...k })).sort((a, b) => a.t - b.t);

  function keyAt(t) {
    let a = keys[0], b = keys[0], u = 0;
    if (t >= keys[keys.length - 1].t) a = b = keys[keys.length - 1];
    else if (t > keys[0].t) {
      for (let i = 0; i < keys.length - 1; i++) {
        if (t >= keys[i].t && t < keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; u = toEase(b.ease)(clamp((t - a.t) / (b.t - a.t))); break; }
      }
    }
    return {
      target: [lerp(a.target[0], b.target[0], u), lerp(a.target[1], b.target[1], u), lerp(a.target[2], b.target[2], u)],
      az: lerp(a.az, b.az, u), el: lerp(a.el, b.el, u), dist: lerp(a.dist, b.dist, u),
    };
  }
  /** cameraAt(t) -> { pos, target, up, forward, fov, el, dist, picture } */
  function cameraAt(t) {
    const k = keyAt(t), c = camFrom(k);
    return { ...c, fov: S.camera.fov, el: k.el, az: k.az, dist: k.dist, picture: k.el > Math.PI / 2 - 1e-6 };
  }

  // ---- the sliding tray (metres along +X); du is in picture units of that level
  const SL = o.slide, slideLevel = lay.levels[SL.level];
  const slideMetres = SL.du * slideLevel.halfW;
  const slideAt = (t) => slideMetres * toEase("inOutSine")(clamp((t - SL.t0) / (SL.t1 - SL.t0)));

  // ---- the cel bird: drawn on twos (pose and position held for two frames)
  const C = S.cel, BD = o.bird;
  const omega = (2 * Math.PI) / BD.period, phase0 = Math.PI / 2 - omega * BD.turnAt; // right-hand turn at turnAt
  /** birdAt(t) -> { u, v, pose, flip, tq } (u, v in picture units of the cel level) */
  function birdAt(t) {
    const n = Math.floor(t * C.fps + 1e-6), tq = n / C.fps, pose = ((n % C.poses) + C.poses) % C.poses;
    const ph = omega * tq + phase0;
    const flap = Math.cos((pose / C.poses) * 2 * Math.PI);
    return {
      u: BD.u0 + BD.au * Math.sin(ph),
      v: BD.v0 + BD.av * Math.sin(2 * ph + 0.6) + 0.012 * flap,
      pose, flip: Math.cos(ph) < 0, tq,
    };
  }
  const cycle = C.poses / C.fps;
  /** flapTimes() -> every downstroke (pose 0) time in [0, end) */
  const flapTimes = () => { const out = []; for (let k = 0; k * cycle < o.end - 1e-9; k++) out.push(+(k * cycle).toFixed(6)); return out; };
  /** closeness(t) -> 1 inside the picture, smaller the further the camera is from the stack (sound level of the cel) */
  const closeness = (t) => clamp(3.3 / cameraAt(t).dist, 0.25, 1);

  /** events() -> planned sound events (kinds match multiplaneVoices) */
  function events() {
    const E = [{ kind: "bed", t: 0, dur: o.end }];
    for (const f of flapTimes()) E.push({ kind: "flap", t: f, g: closeness(f) });
    for (const e of o.cues ?? []) E.push(e);
    E.push({ kind: "slideStart", t: SL.t0 }, { kind: "slide", t: SL.t0, dur: SL.t1 - SL.t0 }, { kind: "slideStop", t: SL.t1 });
    return E.sort((a, b) => a.t - b.t);
  }

  return { layout: lay, keys, keyAt, cameraAt, slideAt, slideMetres, slideLevel: SL.level, birdAt, flapTimes, closeness, events, cycle };
}

/** multiplaneVoices(SND) -> voices for kit schedule.scoreFromEvents */
export function multiplaneVoices(SND) {
  return {
    bed: (e) => [{ type: "pad", bus: "music", root: SND.bed.root, chord: SND.bed.chord, dur: e.dur, attack: SND.bed.attack, release: SND.bed.release, brightness: SND.bed.brightness, gain: SND.bed.gain }],
    box: (e) => [{ type: "pluck", hz: e.hz ?? SND.box.hz, notes: e.notes, step: e.step ?? 0.14, dur: 2.2, decay: SND.box.decay, bright: SND.box.bright, gain: SND.box.gain * (e.g ?? 1) }],
    chirp: (e) => [
      { type: "blip", notes: [0, 7, 12], dur: 0.05, pitch: SND.chirp.pitch, gain: SND.chirp.gain },
      { type: "blip", notes: [12, 9], dur: 0.045, pitch: SND.chirp.pitch * 1.06, gain: SND.chirp.gain * 0.8, offset: 0.24 },
    ],
    flap: (e) => [{ type: "paper", dur: SND.flap.dur, density: 0.5, pitch: 1.5, gain: SND.flap.gain * e.g }],
    push: (e) => [{ type: "whoosh", dir: "in", dur: e.dur, q: 1.2, pitch: 0.8, gain: SND.push.gain }],
    pull: (e) => [{ type: "whoosh", dir: "out", dur: e.dur, q: 1.0, pitch: 0.7, gain: SND.push.gain }],
    settle: (e) => [
      { type: "thud", dur: 0.5, pitch: 0.8, gain: SND.rig.thud },
      { type: "hum", dur: e.dur, gain: SND.rig.hum },
    ],
    slideStart: () => [{ type: "clack", gain: SND.rig.clack, pitch: 0.9 }],
    slide: (e) => [{ type: "whir", dur: e.dur, hz: 120, hz2: 175, gain: SND.rig.whir }],
    slideStop: () => [{ type: "clack", gain: SND.rig.clack, pitch: 0.75 }],
    land: () => [{ type: "chime", dur: 1.6, pitch: 1.0, gain: 0.12 }],
  };
}

/** paneArt(level, slideX = 0) -> painted rectangle of a level in world XZ: { x0, x1, z0, z1 } */
export function paneArt(S, level, slideX = 0) {
  if (level.full) { const P = S.rig.pane; return { x0: -P.w / 2 + slideX, x1: P.w / 2 + slideX, z0: -P.d / 2, z1: P.d / 2 }; }
  return { x0: -level.margin * level.halfW + slideX, x1: level.margin * level.halfW + slideX, z0: -level.margin * level.halfH, z1: level.margin * level.halfH };
}

export { smoothstep };
