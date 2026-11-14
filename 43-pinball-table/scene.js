// scene.js — 43-pinball-table: "Finish a project" as one ball's run. The plan (ball schedule, lamps, reels) lives in
// scene.config.js; the table, its props and the caption come from the style. renderAt only reads the plan at t.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { createStyle } from "./_atlas/styles/pinball-table/style.js";
import { pulse, dropFrac } from "./_atlas/styles/pinball-table/pinplan.js";
import { DURATION, BEATS, CAMERA, SCORE, DUCK, PLAN, EVENTS, LAMPS, REELS } from "./scene.config.js";

await document.fonts.ready;

const stage = createStage({ canvas: "#stage", fov: 36, near: 0.05, far: 30 });
const style = createStyle(stage);
const S = style.spec;
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const table = style.props.table(PLAN);
const caption = style.props.caption(BEATS);

// event times per prop (plain arrays; pure lookups at t)
const times = (f) => EVENTS.filter(f).map((e) => e.t);
const KICK = {
  A: times((e) => e.kind === "bumper" && e.id === "A"),
  B: times((e) => e.kind === "bumper" && e.id === "B"),
  C: times((e) => e.kind === "bumper" && e.id === "C"),
  slingL: times((e) => e.kind === "sling" && e.id === "L"),
  slingR: times((e) => e.kind === "sling" && e.id === "R"),
};
const DROP = PLAN.lay.bank.targets.map((tg, k) => { const id = ["D", "O2", "N", "E"][k]; const e = EVENTS.find((x) => x.kind === "target" && x.id === id); return e ? e.t : Infinity; });
const ROLL = ["G", "O1", "A", "L"].map((id) => times((e) => e.kind === "rollover" && e.id === id));
const BELLS = times((e) => e.kind === "bell");
const reelIdx = Array.from({ length: S.score.reels }, (_, k) => k);

function renderAt(t) {
  const kick = {};
  for (const k in KICK) kick[k] = pulse(KICK[k], t, { rise: 0.012, decay: k.startsWith("sling") ? S.slings.kickDur * 0.5 : 0.07 });
  table.update({
    ball: PLAN.pos(t),
    flip: { L: PLAN.flipperAngle("L", t), R: PLAN.flipperAngle("R", t) },
    plunger: PLAN.plungerOffset(t),
    lamp: (id) => LAMPS.level(id, t),
    kick,
    downs: DROP.map((td) => dropFrac(td, t, S.bank.fall)),
    dips: ROLL.map((ts) => pulse(ts, t, { rise: 0.02, decay: S.rollover.dur * 0.5 })),
    rolls: reelIdx.map((k) => REELS.roll(k, t)),
    glow: 1 + 0.8 * pulse(BELLS, t, { rise: 0.03, decay: 0.35 }),
  });
  caption.userData.update(t);
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
