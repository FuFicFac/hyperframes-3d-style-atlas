// scene.js — 27-circuit-board: "How a signal moves through a circuit". Every frame is a pure function of t.
import { createStage, clamp } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/circuit-board/style.js";
import {
  DURATION, CAMERA, OBJECTS, SCORE, DUCK, PALETTE, PARTS, ROUTES, DECOR, PLAN, CAPTIONS, SIGNAL_IN, THINK,
} from "./scene.config.js";

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage, { palette: PALETTE });
const { props, plan, palette: pal, spec } = style;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
void objs;

// ---------------------------------------------------------------- the board -------------------------------
const pcb = props.board({ seed: 7 });
stage.scene.add(pcb);
const P = pcb.userData;
const parts = {};
for (const [id, p] of Object.entries(PARTS)) parts[id] = P.place(props.part(p), p.at);

for (const r of [...Object.values(ROUTES), ...DECOR]) { pcb.add(props.trace(r)); P.addTrace(r); }
const viaList = [...Object.values(ROUTES), ...DECOR].flatMap((r) => r.vias.map((v) => v.at));
P.place(props.vias(viaList), [0, 0]);

// silkscreen captions (printed on by the plan) + static board marking
const captions = CAPTIONS.map((c) => {
  const m = props.silkLabel(c.text, { cap: c.cap, align: "center" });
  P.place(m, c.at);
  m.position.y = 0.0012;
  P.reserve([c.at[0], c.at[1], m.userData.size[0], m.userData.size[1]]);
  return { ...c, m };
});
P.silk({ text: "SIGNAL PATH DEMO  REV A", at: [-1.2, -1.52], cap: 0.07, align: "center" });
P.silk({ text: "IN", at: [-2.75, 0.75], cap: 0.07, align: "center" });
P.bake();

// ---------------------------------------------------------------- signals ---------------------------------
const pulses = PLAN.pulses.map((p) => { const m = props.pulse(p.route); pcb.add(m); return { p, m }; });
const viaFlashes = PLAN.pulses.flatMap((p) => p.vias.map((v) => {
  const f = props.flash(); f.position.x = v.at[0]; f.position.z = v.at[1]; pcb.add(f); return { f, t: v.t };
}));
const arriveFlashes = PLAN.pulses.map((p) => {
  const f = props.flash({ radius: 0.22 }); f.position.x = p.route.to[0]; f.position.z = p.route.to[1]; pcb.add(f); return { f, t: p.t1 };
});
// J1's pin lights when the signal is at the connector
const j1Flash = props.flash({ radius: 0.26 });
{ const a = plan.partPin(PARTS.J1, null, 2); j1Flash.position.set(a[0], 0.02, a[1]); pcb.add(j1Flash); }
// processor "thinking": pad flashes in sequence before it answers
const think = THINK.pins.map(([side, i], k) => {
  const f = props.flash({ radius: 0.12 }); const a = plan.partPin(PARTS.U1, side, i);
  f.position.x = a[0]; f.position.z = a[1]; pcb.add(f); return { f, t: THINK.start + k * THINK.step };
});
const pool = props.lightPool();
stage.scene.add(pool);
const L = spec.pulse.light;

// power-on times of parts (first arrival of a pulse at them)
const firstArrive = {};
for (const p of PLAN.pulses) if (p.target && !(p.target in firstArrive)) firstArrive[p.target] = p.t1;
const leds = ["D1", "D2", "D3"];

// ---------------------------------------------------------------- frame -----------------------------------
function renderAt(t) {
  const lights = [];
  // pulses: head, tail, afterglow (the first wave's afterglow stays: the path is powered)
  for (const { p, m } of pulses) {
    const s = plan.pulseAt(t, p);
    m.userData.set(s, p.wave === 2 ? 0 : 1);
    if (s.active && s.head <= p.length + 0.05) {
      const a = plan.headPoint(t, p);
      lights.push({ at: [a[0], L.height, a[1]], color: pal.pulse, intensity: L.intensity * s.level * (p.gain ?? 1) });
    }
  }
  for (const v of viaFlashes) v.f.userData.set(plan.flashAt(t, v.t));
  for (const v of arriveFlashes) v.f.userData.set(plan.flashAt(t, v.t, 0.5) * 0.8);
  j1Flash.userData.set(plan.flashAt(t, SIGNAL_IN.at, 0.7) + plan.powerAt(t, SIGNAL_IN.at, { rise: 0.3 }) * (1 - plan.powerAt(t, PLAN.launch("in"), { rise: 0.3 })) * 0.45);
  for (const k of think) k.f.userData.set(plan.flashAt(t, k.t, 0.3) * 0.8);

  // parts power up when the first pulse reaches them; a second wave flares them again
  const flare = (id) => Math.max(0, ...PLAN.pulses.filter((p) => p.target === id).map((p) => plan.flashAt(t, p.t1, 0.6)));
  for (const id of ["U1", "U2"]) {
    const on = plan.powerAt(t, firstArrive[id] ?? Infinity, { rise: 0.3 });
    const thinking = id === "U1" ? 0.25 * clamp((t - THINK.start) / 0.2) * (1 - clamp((t - (THINK.start + THINK.pins.length * THINK.step)) / 0.3)) : 0;
    parts[id].userData.setPower(on * 0.75 + flare(id) * 0.8 + thinking);
  }
  for (const id of leds) {
    const on = plan.powerAt(t, firstArrive[id] ?? Infinity, { rise: 0.12 });
    const lv = on + flare(id) * 0.6;
    parts[id].userData.setPower(lv);
    if (lv > 0.001) {
      const pp = PARTS[id].at;
      lights.unshift({ at: [pp[0], 0.14, pp[1]], color: pal.led, intensity: spec.led.light * Math.min(lv, 1.4), distance: 1.0 });
    }
  }
  pool.userData.assign(lights);

  // silkscreen captions: print on, then wipe off (one at a time)
  for (const c of captions) {
    const on = plan.revealAt(t, c.on), off = plan.revealAt(t, c.off, 0.4);
    c.m.userData.setReveal(off > 0 ? 1 - off : on);
  }

  const cam = rig.update(t);
  style.render(t, { focus: cam.target.toArray() });
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
