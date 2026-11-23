// scene.js — 111-granular-sorting: "Shaken into order". Beats, camera keys, the simulation run, the plan and SCORE live
// in scene.config.js; the counter, wall, shaker, jar, beads, rings, trails and caption come from the style. Every frame
// is a pure function of t: renderAt poses every bead, the platform, the rings and the trails from PLAN; nothing carries
// over between frames.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { smoothstep } from "./_atlas/kit/time.js";
import { createStyle } from "./_atlas/styles/granular-sorting/style.js";
import { DURATION, CAMERA, SCORE, DUCK, PLAN, LABELS, RINGS, TRAILS, HIGHLIGHT, HIGHLIGHT_OFF } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30, near: 0.1, far: 60 });
const style = createStyle(stage);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const jar = style.props.rig(PLAN, { highlight: HIGHLIGHT.map((h) => h.j) });
const hiAt = new Map(HIGHLIGHT.map((h) => [h.j, h.t]));
const highlightFor = (t) => (j) => smoothstep(hiAt.get(j), hiAt.get(j) + 0.2, t) * (1 - smoothstep(HIGHLIGHT_OFF.t, HIGHLIGHT_OFF.t + HIGHLIGHT_OFF.dur, t));
const caption = style.props.caption();

const ringAt = new Map();
RINGS.first.forEach((r) => ringAt.set(`f${r.i}`, r.t));
RINGS.last.forEach((r) => ringAt.set(`l${r.i}`, r.t));
const ringStartFor = (t) => (i) => {
  const a = ringAt.get(`f${i}`), b = ringAt.get(`l${i}`);
  return t < b ? a : b;
};
const trailLevelFor = (t) => (i) => {
  const out = 1 - smoothstep(TRAILS.fadeOff, TRAILS.fadeOff + TRAILS.fadeDur, t);
  const all = smoothstep(TRAILS.allOn, TRAILS.allOn + 0.4, t);
  const mine = i === PLAN.focus.i ? smoothstep(TRAILS.focusOn, TRAILS.focusOn + 0.4, t) : 0;
  const home = 1 - smoothstep(PLAN.arriveT[i] + TRAILS.arriveHold, PLAN.arriveT[i] + TRAILS.arriveHold + TRAILS.arriveFade, t); // fades once on top
  return TRAILS.level * Math.max(all, mine) * out * home;
};

function renderAt(t) {
  jar.update(t, { ringStart: ringStartFor(t), trailLevel: trailLevelFor(t), highlight: highlightFor(t) });
  // one caption at a time: the plate stays, the text swaps with a quick fade at each beat boundary
  for (const L of LABELS) {
    if (t >= L.on && t < L.off) {
      // never fully blank: the outgoing text dips to 30 % in its last 0.18 s, the incoming one rises from 30 %
      const a = (L.first ? 1 : 0.3 + 0.7 * smoothstep(L.on, L.on + 0.18, t)) * (1 - 0.7 * smoothstep(L.off - 0.18, L.off, t));
      caption.userData.show(L.text, a);
      break;
    }
  }
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
