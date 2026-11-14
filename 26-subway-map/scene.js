// scene.js — 26-subway-map: "Idea to launch" drawn as a physical transit map. Built from subway-map props;
// every frame is a pure function of t (lay clocks + timetables are closed form; no accumulation).
import { createStage, clamp } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { pop } from "./_atlas/kit/motion.js";
import { createStyle } from "./_atlas/styles/subway-map/style.js";
import {
  DURATION, CAMERA, SCORE, DUCK, LINES, LAY, STATIONS, STATION_POP, INTERCHANGES, TRAINS, CAPTIONS, HERE, FINAL, LEGEND,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage" });
const style = createStyle(stage);
const X = style.props, P = style.plan, pal = style.palette, SP = style.spec;
const add = (o) => (stage.scene.add(o), o);

// ---------------------------------------------------------------- panel
add(X.table());
const panel = add(X.panel({ w: 23.6, d: 10.4 }));
panel.position.z = -1.35;

// ---------------------------------------------------------------- routes + lay clocks
const routes = {}, lays = {};
for (const [k, l] of Object.entries(LINES)) {
  routes[k] = add(X.route(l.way, { color: l.color }));
  lays[k] = P.layPlan(LAY[k]);
}
const lineColour = (k) => routes[k].userData.color;

// ---------------------------------------------------------------- stations, interchanges
const stations = STATIONS.map((s) => {
  const m = add(X.station());
  m.position.set(s.at[0], 0, s.at[1]);
  return { s, m };
});
const ics = INTERCHANGES.map((c) => ({ c, m: add(X.interchange({ a: c.a, b: c.b })) }));

// ---------------------------------------------------------------- trains
const trains = TRAINS.map((tr) => ({ tr, tt: P.timetable(tr.tt), m: add(X.train({ color: tr.color })), path: routes[tr.line].userData.path }));

// ---------------------------------------------------------------- "you are here" + legend
const here = add(X.youAreHere());
here.position.set(STATIONS[0].at[0], stations[0].m.userData.top, STATIONS[0].at[1]);
const legend = add(X.legend({ w: LEGEND.w, items: Object.values(LINES).map((l) => ({ color: l.color, text: l.name })) }));
legend.position.set(LEGEND.at[0], 0, LEGEND.at[1]);

// ---------------------------------------------------------------- overlay
const sign = X.sign();
const hereTag = X.tag("YOU ARE HERE", { kind: "here" });
const nameTags = STATIONS.map((s) => X.tag(s.name));
const TAG_SIDE = { ideas: { align: "right", dy: 26 }, plan: { align: "left", dy: 30 }, review: { align: "left", dy: 30 }, build: { align: "left", dy: 4 }, ship: { align: "left", dy: 30 } };

const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });

function renderAt(t) {
  for (const k in routes) routes[k].userData.setDraw(lays[k].head(t));
  stations.forEach(({ s, m }) => m.userData.set(pop(t, STATION_POP[s.id], 0.42)));
  ics.forEach(({ c, m }) => m.userData.set(t >= c.t0 ? 1 : 0, clamp((t - c.t0) / Math.max(0.05, c.t1 - c.t0))));
  trains.forEach(({ tt, m, path }) => {
    const q = tt.at(t);
    m.visible = q.visible;
    if (q.visible) m.userData.place(path, q.s, q.dir, pop(t, tt.legs[0].t0 - 0.35, 0.35, 1.4));
  });
  here.userData.update(t, HERE.pinAt);
  legend.userData.set(pop(t, FINAL.legendAt, 0.5, 1.4));

  rig.update(t);
  // overlay (after the camera so anchors project through this frame's pose)
  const cap = CAPTIONS.find((c) => t >= c.on - 0.01 && t <= c.off + 0.01) ?? CAPTIONS[0];
  sign.userData.update(t, { on: cap.on, off: cap.off, text: cap.text, n: cap.n, color: lineColour("main") });
  const top = stations[0].m.userData.top;
  hereTag.userData.update(t, { ...HERE.tag, anchor: [STATIONS[0].at[0], top + 1.2, STATIONS[0].at[1]], align: "left", dx: 26, dy: 0 });
  nameTags.forEach((g, i) => {
    const s = STATIONS[i], o = TAG_SIDE[s.id];
    g.userData.update(t, { on: FINAL.tagsOn + i * FINAL.tagStep, off: Infinity, anchor: [s.at[0], top, s.at[1]], ...o });
  });
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
