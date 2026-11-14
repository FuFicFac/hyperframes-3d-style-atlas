// scene.config.js — 30-film-projector: "How a letter travels" (a made-up SAMPLE story) as a silent film in a
// screening room. Plain data + the style's pure planner (reel.js). No THREE, no window: imported by scene.js
// (browser) and by render-sfx / export-spec / export-blender (Node). Units: metres, Y-up, radians, s, sRGB hex.
// Room frame: lens at (0, lensY, lensZ) looking down -Z onto the screen at z = screenZ. The film-strip set sits
// far off to +X (STRIP.origin) and is only seen in the strip-ride shots (hard cuts between sets).
import { planFilm, stripFrame, projectorVoices, projectorBed } from "./_atlas/styles/film-projector/reel.js";
import { scoreFromEvents } from "./_atlas/kit/schedule.js";
import { STYLE_SPEC } from "./_atlas/styles/film-projector/spec.js";

export const ID = "30-film-projector";
export const STYLE = "film-projector";
export const DURATION = 15;   // keep equal to data-duration in index.html
export const FPS = 30;

// The story: one picture + one intertitle (<= 26 chars) per beat. Neutral, made up, no numbers.
export const STORY = [
  { id: "write", title: "A LETTER IS WRITTEN", picture: "writingDesk" },
  { id: "train", title: "IT TAKES THE TRAIN", picture: "steamTrain" },
  { id: "sea", title: "IT CROSSES THE SEA", picture: "steamship" },
  { id: "home", title: "AND ARRIVES HOME", picture: "cottage" },
];

const LEADER = { t: 0, dur: 2.0 };
const BEAT_DUR = 2.7;
const TAIL_T = LEADER.t + LEADER.dur + STORY.length * BEAT_DUR;
export const BEATS = [
  { id: "leader", ...LEADER },
  ...STORY.map((s, i) => ({ id: s.id, t: LEADER.t + LEADER.dur + i * BEAT_DUR, dur: BEAT_DUR, title: s.title, picture: s.picture })),
  { id: "tail", t: TAIL_T, dur: DURATION - TAIL_T },
];
const B = Object.fromEntries(BEATS.map((b) => [b.id, b]));

export const PLAN = planFilm({
  leader: { t: B.leader.t, dur: B.leader.dur },
  beats: STORY.map((s) => B[s.id]),
  tail: { t: B.tail.t, dur: B.tail.dur, endCard: 1.5, runout: 0.15 },
  ride: 0.75, cardDelay: 0.2,
});

// ---- set (world metres)
const RM = STYLE_SPEC.room, ST = STYLE_SPEC.strip;
export const SET = {
  lens: [0, RM.lensY, RM.lensZ],
  screen: [0, RM.lensY, RM.screenZ],
  standHeight: RM.lensY - STYLE_SPEC.projector.lens.y,
  projectorZ: RM.lensZ + STYLE_SPEC.projector.body[2] / 2 + STYLE_SPEC.projector.lens.len + 0.004,
  strip: { origin: [60, 2.0, 0], camDist: ST.camDist, lift: ST.camLift, side: 0.1 },
};

// ---- camera: one key pair per shot (hard cuts between shots), all positions derived from SET + the plan
const stripCam = (k) => {
  const f = stripFrame(k), o = SET.strip.origin;
  const c = [o[0] + f.x, o[1], o[2] + f.z];
  return { pos: [c[0] + f.nx * SET.strip.camDist + SET.strip.side, c[1] + SET.strip.lift, c[2] + f.nz * SET.strip.camDist], target: [c[0] + SET.strip.side * 0.4, c[1], c[2]], fov: 30 };
};
const screenCam = (side, push) => ({ pos: [side * 1.65, 1.45, -1.3 - push], target: [side * 0.12, RM.lensY + 0.05, RM.screenZ], fov: 31 });
const WIDE = {
  open: [{ pos: [-2.7, 3.05, 8.7], target: [0.45, 2.15, -2.5], fov: 36 }, { pos: [-2.3, 2.95, 7.9], target: [0.4, 2.15, -2.5], fov: 36 }],
  tail: [{ pos: [2.5, 2.9, 8.1], target: [-0.35, 2.2, -2.5], fov: 36 }, { pos: [1.85, 2.75, 7.1], target: [-0.3, 2.3, -1.5], fov: 36 }],
};
export const CAMERA = PLAN.shots.flatMap((s) => {
  if (s.kind === "wide") { const [a, b] = WIDE[s.id]; return [{ t: s.t, ...a }, { t: s.t + s.dur, ...b, ease: "inOutSine" }]; }
  if (s.kind === "strip") return [{ t: s.t, ...stripCam(s.from) }, { t: s.t + s.dur, ...stripCam(s.to), ease: "inOutCubic" }];
  return [{ t: s.t, ...screenCam(s.side, 0) }, { t: s.t + s.dur, ...screenCam(s.side * 0.8, 0.55), ease: "inOutSine" }];
});

export const OBJECTS = [
  { id: "room", primitive: "procedural", factory: "room", procedural: "screening room: carpet floor, dark acoustic-cloth back and side walls, five rows of upholstered seats with a centre aisle" },
  { id: "projector", primitive: "procedural", factory: "projector", procedural: "wooden stand + vintage reel-to-reel projector: enamel body, lamp house with glowing vents, chrome lens, two holed-flange reels on arms, sprocket drums, threaded film loops", dims: { standHeight: SET.standHeight }, position: [0, 0, SET.projectorZ] },
  { id: "screen", primitive: "procedural", factory: "screen", procedural: "pull-down projection screen: matte fabric (projected-picture shader), black masking border, roller case, bottom bar with pull ring", position: SET.screen },
];

// ---- SCORE: everything from the plan's events (sprocket clatter at the film frame rate, 2-pop, card stings, flaps)
export const SCORE = [
  ...projectorBed(PLAN, DURATION),
  ...scoreFromEvents(PLAN.events.filter((e) => e.t < DURATION - 0.02), projectorVoices(PLAN)),
];
export const DUCK = []; // duckFromBeats(beatsFromSrt(vo_srt)) once a voiceover exists
export const NOTES = { set: SET, story: STORY, shots: PLAN.shots, times: PLAN.times, frame: "lens at (0, lensY, lensZ) looking down -Z; strip set far off at +X" };
