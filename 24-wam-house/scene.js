// scene.js — 24-wam-house: the Why AI Matters channel package reel. Every frame is a pure function of t.
// Fonts: League Gothic + Space Mono are embedded by the HyperFrames compiler (named in index.html CSS); we wait
// for them (top-level await) BEFORE tracing the display capitals, so the extruded type is the real face.
import { createStage } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle, loadFonts } from "./_atlas/styles/wam-house/style.js";
import { DURATION, CAMERA, OBJECTS, SCORE, DUCK, SETS, WHIPS, PLANS, COPY } from "./scene.config.js";

await loadFonts();

const stage = createStage({ canvas: "#stage", shadowType: "pcf" });
const style = createStyle(stage);
const { props, spec } = style;
objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const rig = createCameraRig(stage.camera, CAMERA, { drift: null });
const X = Object.fromEntries(SETS.map((s) => [s.id, s.x]));
const RS = spec.rule;

// ---- 1. IDENT -------------------------------------------------------------------------------------
const ident = props.displayType(COPY.ident.text, { cap: 1.1, wordTones: COPY.ident.wordTones });
ident.position.set(X.ident, 0, 0);
stage.scene.add(ident);
const tagline = props.dataLabel(COPY.ident.tagline);

// ---- 2. LOWER THIRD (overlay) ------------------------------------------------------------------------
const lower = props.lowerThird(COPY.lowerThird);

// ---- 3. CHAPTER CARD ----------------------------------------------------------------------------------
const chapter = props.chapterCard({ ...COPY.chapter, stack: true });
chapter.position.set(X.chapter, 0, 0);
stage.scene.add(chapter);

// ---- 4. KEY STAT ---------------------------------------------------------------------------------------
const stat = props.keyStat({ cap: 2.6, suffix: COPY.stat.suffix, plan: PLANS.stat, tone: "faceRed" });
stat.position.set(X.stat, 0, 0);
stage.scene.add(stat);
const statLabel = props.dataLabel(COPY.stat.label);
const statTag = props.sampleTag(COPY.stat.tag, { px: 28 });

// ---- 5. END CARD ----------------------------------------------------------------------------------------
const end = props.displayType(COPY.end.text, { cap: 1.25 });
end.position.set(X.end, 0, 0);
stage.scene.add(end);
const endLine = props.dataLabel(COPY.end.line);
const bug = props.identBug();

// which set is "active" (for lights + mirror centre): the one the camera target is nearest to
const activeSet = (tx) => SETS.reduce((b, s) => (Math.abs(s.x - tx) < Math.abs(b.x - tx) ? s : b), SETS[0]);
const frameW = (d, fov) => 2 * d * Math.tan((fov * Math.PI) / 360) * (stage.width / stage.height);

function renderAt(t) {
  rig.update(t);
  const cam = rig.sample(t), prev = rig.sample(t - 1 / 30);
  const tx = cam.target.x;
  const s = activeSet(tx);
  // light level crossfades with the camera between sets
  const lv = SETS.reduce((acc, k) => acc + k.level * Math.max(0, 1 - Math.abs(k.x - tx) / spec.set.spacing), 0);
  style.lightsAt(tx, lv);
  // whip blur: screen-px moved per frame × shutter
  const d = cam.pos.distanceTo(cam.target);
  style.whip((Math.abs(cam.target.x - prev.target.x) / frameW(d, cam.fov)) * stage.width * spec.whip.blur);

  const vis = (id, pad = 0.6) => { const b = SETS.find((k) => k.id === id); return Math.abs(tx - b.x) < spec.set.spacing - pad; };

  ident.visible = vis("ident");
  ident.userData.update(t, PLANS.ident);
  tagline.userData.update(t, { on: PLANS.ident.tag.on, cps: PLANS.ident.tag.cps, off: WHIPS[0].start + 0.05, anchor: [X.ident, 0, RS.depth / 2], dy: 26 });

  lower.userData.update(t, PLANS.lower);

  chapter.visible = vis("chapter");
  chapter.userData.update(t, PLANS.chapter);

  stat.visible = vis("stat");
  stat.userData.update(t, PLANS.stat);
  statLabel.userData.update(t, { on: PLANS.stat.label.on, cps: PLANS.stat.label.cps, off: WHIPS[3].start + 0.05, anchor: [X.stat, 0, RS.depth / 2], dy: 26 });
  statTag.userData.update(t, { on: PLANS.stat.tag.on, off: WHIPS[3].start + 0.05, anchor: [X.stat + stat.userData.finalWidth / 2 + 0.3, 2.6 + RS.height, 0] });

  end.visible = vis("end");
  end.userData.update(t, PLANS.end);
  endLine.userData.update(t, { on: PLANS.end.line.on, cps: PLANS.end.line.cps, anchor: [X.end, 0, RS.depth / 2], dy: 26 });
  bug.userData.update(t, { on: PLANS.end.bug.on, dur: PLANS.end.bug.dur });

  style.render(t, { setX: s.x });
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
