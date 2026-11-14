// scene.js — 02-paper-pop-up: "A short history of AI" in four pop-up spreads.
// Data lives in scene.config.js; this file builds the demo-specific card silhouettes from the style's
// props and drives every hinge / leaf / tab from t. Pure function of time: no rAF, no accumulation.
import { createStage, Timeline, clamp, ease } from "./_atlas/kit/core.js";
import { createCameraRig } from "./_atlas/kit/camera.js";
import { objectsFromSpec } from "./_atlas/kit/spec.js";
import { createStyle } from "./_atlas/styles/paper-pop-up/style.js";
import { DURATION, BEATS, CAMERA, OBJECTS, SCORE, DUCK, SPREADS, TIMING, schedule, flipAt } from "./scene.config.js";

const stage = createStage({ canvas: "#stage", fov: 30 });
const style = createStyle(stage);
const { props, shapes: S, motion } = style;
const { cardPiece: card, glue, standUp, flat } = props;
const objs = objectsFromSpec(stage.scene, OBJECTS, style.materials, { textStyle: style.textStyle, factories: style.factories });
const tl = new Timeline(BEATS);
const rig = createCameraRig(stage.camera, CAMERA, { drift: style.camera.drift });
const book = objs.book;

// ---------------------------------------------------------------------------------------------
// Demo silhouettes (built standing in their own XY plane, bottom on y = 0, facing +Z)
// ---------------------------------------------------------------------------------------------
/** Mirror a right-half profile [[x,y],...] (bottom -> top) into a symmetric outline. */
const sym = (half) => S.poly([...half, ...half.slice().reverse().map(([x, y]) => [-x, y])].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]));
const scalePts = (pts, k) => pts.map(([x, y]) => [x * k, y * k]);

function reel(r) {
  const disc = card({
    shape: S.circle(r), color: "cream",
    print: (h) => {
      h.stroke("ink", 0.02, (c) => c.arc(h.X(0), h.Y(0), (r - 0.025) * h.s, 0, Math.PI * 2));
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
        h.circle(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.2, "tealLight");
      }
    },
  });
  glue(disc, card({ shape: S.circle(r * 0.22), color: "ink" }));
  return disc;
}

const make = {
  cabinet({ w, h, color, reels = 2 }) {
    const body = card({ shape: S.roundRect(w, h, 0.05), color });
    glue(body, card({ shape: S.rect(w * 0.78, 0.1, { y: h - 0.2 }), color: "mustard" }));
    const r = Math.min(0.23, w * 0.19);
    for (let i = 0; i < reels; i++) glue(body, reel(r), { x: (i - (reels - 1) / 2) * w * 0.46, y: h * 0.62 });
    const pw = w * 0.74, ph = 0.34, py = h * 0.18;
    glue(body, card({
      shape: S.roundRect(pw, ph, 0.03, { y: py }), color: "cream",
      print: (hh) => {
        const cols = 6, rows = 2, dot = ["coral", "mustard", "ink", "teal"];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          hh.circle(-pw / 2 + (i + 0.5) * (pw / cols), py + 0.1 + j * 0.14, 0.04, dot[(i * 3 + j * 5 + Math.round(w * 10)) % 4]);
        }
      },
    }));
    return { content: body, stemColor: color };
  },
  console({ w, h, color }) {
    const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h * 0.62], [w / 2 - 0.3, h], [-w / 2 + 0.3, h], [-w / 2, h * 0.62]];
    const body = card({
      shape: S.poly(pts), color,
      print: (hh) => {
        for (let i = 0; i < 7; i++) {
          const x = -w / 2 + 0.45 + i * ((w - 0.9) / 6);
          hh.circle(x, h * 0.72, 0.065, i % 3 === 1 ? "coral" : "ink");
          hh.rect(x - 0.02, h * 0.18, 0.04, 0.16, "ink");
        }
        hh.rect(-w / 2 + 0.12, h * 0.46, w - 0.24, 0.018, "mustardDark");
      },
    });
    return { content: body, stemColor: color };
  },
  thought({ text }) {
    const cy = 0.78, r = 0.48;
    const cloud = card({ shape: S.scallop(r, 9, 0.13, { y: cy }), color: "cream", print: (h) => h.text(text, 0, cy - 0.02, 0.62, { color: "coral" }) });
    glue(cloud, card({ shape: S.circle(0.1, { x: -0.38, y: 0.22 }), color: "cream" }));
    glue(cloud, card({ shape: S.circle(0.065, { x: -0.52, y: 0.07 }), color: "cream" }));
    glue(cloud, card({ shape: S.rect(0.08, cy - 0.2), color: "coral" }), { back: true });
    return { content: cloud, stemColor: "coral", stem: 0.08 };
  },
  badge({ text, r }) {
    return { content: props.dateBadge({ text, r }), stemColor: "coral", stem: 0.2 };
  },
  ribbon({ text }) {
    return { content: props.ribbon({ text, maxWidth: 5.0, height: 0.64 }), stemColor: "mustardDark", stem: 0.4 };
  },
  board({ cols, rows, cell }) {
    const w = cols * cell, h = rows * cell;
    const b = card({
      shape: S.rect(w + 0.1, h + 0.1, { y: -0.05 }), color: "ink",
      print: (hh) => {
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) hh.rect(-w / 2 + i * cell, j * cell, cell, cell, (i + j) % 2 ? "tealLight" : "cream");
      },
    });
    return b;
  },
  chess({ piece, color, accent, scale = 1 }) {
    const P = {
      king: [[0.34, 0], [0.34, 0.08], [0.27, 0.12], [0.27, 0.16], [0.19, 0.22], [0.12, 0.84], [0.22, 0.89], [0.22, 0.94], [0.14, 0.97], [0.21, 1.17], [0.04, 1.2], [0.04, 1.27], [0.11, 1.27], [0.11, 1.33], [0.04, 1.33], [0.04, 1.43], [0, 1.43]],
      pawn: [[0.27, 0], [0.27, 0.07], [0.2, 0.11], [0.2, 0.14], [0.12, 0.19], [0.08, 0.42], [0.16, 0.46], [0.16, 0.49], [0.07, 0.51],
        ...Array.from({ length: 9 }, (_, i) => { const a = -0.95 + (i / 8) * (Math.PI / 2 + 0.95); return [Math.cos(a) * 0.13, 0.62 + Math.sin(a) * 0.13]; })],
    };
    const knight = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.22, 0.12], [0.22, 0.17], [0.2, 0.22], [0.27, 0.45], [0.25, 0.63], [0.15, 0.78], [0.09, 0.88], [0.02, 0.8], [-0.12, 0.75], [-0.29, 0.6], [-0.31, 0.51], [-0.23, 0.46], [-0.08, 0.52], [-0.04, 0.42], [-0.17, 0.23], [-0.22, 0.17], [-0.22, 0.12], [-0.3, 0.08]];
    const shape = piece === "knight" ? S.poly(scalePts(knight, 0.95 * scale)) : sym(scalePts(P[piece], scale));
    const k = (piece === "knight" ? 0.95 : 1) * scale;
    const collar = { king: 0.9, pawn: 0.47, knight: 0.12 }[piece] * (piece === "knight" ? 0.95 * scale : scale);
    const body = card({
      shape, color,
      print: (h) => {
        h.rect(-0.5, collar - 0.03 * k, 1, 0.05 * k, accent);
        h.rect(-0.5, 0.08 * k, 1, 0.03 * k, accent);
        if (piece === "knight") h.circle(-0.06 * k, 0.64 * k, 0.035 * k, accent);
        if (color === "ink" && piece === "king") for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) h.circle(-0.06 + i * 0.06, (0.42 + j * 0.08) * k, 0.016, accent);
      },
    });
    return { content: body, stemColor: color, stem: 0.16 };
  },
  sheet({ w, h, color, dots: [cols, rows] }) {
    const sh = card({
      shape: S.roundRect(w, h, 0.07), color,
      print: (hh) => {
        const px = (i) => -w / 2 + 0.22 + i * ((w - 0.44) / Math.max(1, cols - 1));
        const py = (j) => 0.22 + j * ((h - 0.44) / Math.max(1, rows - 1));
        for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows; j++) for (let k = 0; k < rows; k++) {
          hh.stroke("cream", 0.006, (c) => { c.moveTo(hh.X(px(i)), hh.Y(py(j))); c.lineTo(hh.X(px(i + 1)), hh.Y(py(k))); });
        }
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          hh.circle(px(i), py(j), 0.075, "ink");
          hh.circle(px(i), py(j), 0.05, "cream");
        }
      },
    });
    return { content: sh, stemColor: color, stem: 0.3 };
  },
  eye() {
    const cy = 0.74, rx = 0.62, ry = 0.36, n = 48;
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; pts.push([-rx * Math.cos(a), cy + ry * Math.pow(Math.sin(a), 1.25)]); }
    for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; pts.push([rx * Math.cos(a), cy - ry * 0.8 * Math.pow(Math.sin(a), 1.25)]); }
    const eye = card({
      shape: S.poly(pts), color: "cream",
      print: (h) => {
        h.stroke("ink", 0.028, (c) => pts.forEach(([x, y], i) => (i ? c.lineTo(h.X(x), h.Y(y)) : c.moveTo(h.X(x), h.Y(y)))) || c.closePath());
        for (let i = 0; i < 5; i++) {
          const a = 0.55 + i * 0.5, x = -rx * Math.cos(a), y = cy + ry * Math.pow(Math.sin(a), 1.25);
          h.stroke("ink", 0.03, (c) => { c.moveTo(h.X(x), h.Y(y)); c.lineTo(h.X(x * 1.1), h.Y(y + 0.11)); });
        }
      },
    });
    const iris = card({
      shape: S.circle(0.24, { y: cy }), color: "teal",
      print: (h) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; h.stroke("tealLight", 0.012, (c) => { c.moveTo(h.X(Math.cos(a) * 0.12), h.Y(cy + Math.sin(a) * 0.12)); c.lineTo(h.X(Math.cos(a) * 0.21), h.Y(cy + Math.sin(a) * 0.21)); }); } },
    });
    glue(eye, iris);
    const pupil = glue(iris, card({ shape: S.circle(0.1, { y: cy }), color: "ink" }));
    glue(pupil, card({ shape: S.circle(0.04, { x: 0.06, y: cy + 0.06 }), color: "cream" }));
    glue(eye, card({ shape: S.rect(0.1, cy - 0.2), color: "ink" }), { back: true });
    return { content: eye, stemColor: "ink", stem: 0.1 };
  },
  cat() {
    const pts = [[-0.3, 0], [0.28, 0], [0.42, 0.02], [0.54, 0.08], [0.6, 0.2], [0.58, 0.32], [0.52, 0.3], [0.52, 0.2], [0.46, 0.12], [0.34, 0.1],
      [0.3, 0.32], [0.18, 0.5], [0.08, 0.58], [0.07, 0.72], [0.06, 0.9], [-0.05, 0.8], [-0.16, 0.8], [-0.26, 0.9], [-0.28, 0.72], [-0.28, 0.6], [-0.2, 0.5], [-0.17, 0.4], [-0.24, 0.2], [-0.3, 0.08]];
    const k = 1.1, sp = scalePts(pts, k);
    const cat = card({
      shape: S.poly(sp), color: "ink",
      print: (h) => {
        for (const x of [-0.17, -0.04]) h.fill("mustard", (c) => c.ellipse(h.X(x * k), h.Y(0.69 * k), 0.035 * k * h.s, 0.05 * k * h.s, 0, 0, Math.PI * 2));
        h.circle(-0.105 * k, 0.62 * k, 0.018 * k, "coral");
      },
    });
    return { content: cat, stemColor: "ink", stem: 0.3 };
  },
  chat({ w, h }) {
    const win = card({
      shape: S.roundRect(w, h, 0.1), color: "cream",
      print: (hh) => {
        hh.stroke("ink", 0.014, (c) => c.roundRect(hh.X(-w / 2 + 0.14), hh.Y(0.34), (w - 0.62) * hh.s, 0.2 * hh.s, 0.08 * hh.s));
        for (let i = 0; i < 3; i++) hh.roundRect(-w / 2 + 0.28, 0.21, 0.6 - i * 0.12, 0.035, 0.015, "tealLight");
      },
    });
    glue(win, card({
      shape: S.roundRect(w - 0.12, 0.24, 0.06, { y: h - 0.3 }), color: "teal",
      print: (hh) => ["coral", "mustard", "cream"].forEach((c, i) => hh.circle(-w / 2 + 0.24 + i * 0.13, h - 0.18, 0.04, c)),
    }));
    const bw = 1.45, bh = 0.46, by = 1.0, bx = w / 2 - 0.85;
    glue(win, card({
      shape: S.bubble(bw, bh, 0.12, { x: bx, y: by - 0.14, tail: { x: 0.6, w: 0.18, len: 0.14, at: 0.45 } }), color: "coral",
      print: (hh) => { hh.roundRect(bx - bw / 2 + 0.15, by + 0.26, bw - 0.3, 0.06, 0.03, "cream"); hh.roundRect(bx - bw / 2 + 0.15, by + 0.12, bw - 0.7, 0.06, 0.03, "cream"); },
    }));
    glue(win, card({ shape: S.circle(0.11, { x: w / 2 - 0.3, y: 0.24 }), color: "mustard" }));
    return { content: win, stemColor: "teal", stem: 0.6 };
  },
  reply() {
    const bw = 1.75, bh = 0.6, y0 = 0.36;
    const b = card({
      shape: S.bubble(bw, bh, 0.14, { y: y0 - 0.16, tail: { x: -0.75, w: 0.2, len: 0.16, at: -0.55 } }), color: "teal",
      print: (hh) => [0, 1, 2].forEach((i) => hh.roundRect(-bw / 2 + 0.16, y0 + bh - 0.17 - i * 0.15, bw - 0.32 - (i === 2 ? 0.55 : i * 0.12), 0.06, 0.03, "cream")),
    });
    glue(b, card({ shape: S.rect(0.1, y0 - 0.1), color: "teal" }), { back: true });
    return { content: b, stemColor: "teal", stem: 0.1 };
  },
  speech({ text }) {
    const b = card({
      shape: S.bubble(1.02, 0.8, 0.2, { tail: { x: -0.24, w: 0.26, len: 0.3, at: -0.12 } }), color: "mustard",
      print: (h) => h.text(text, 0, 0.3 + 0.4, 0.66, { color: "ink" }),
    });
    return { content: b, stemColor: "mustard", stem: 0.08 };
  },
};

// ---------------------------------------------------------------------------------------------
// Build every spread onto the book's anchors
// ---------------------------------------------------------------------------------------------
const pieces = []; // { pivot, popAt, foldAt, topple? }
const tabs = [];   // { group, beat }
SPREADS.forEach((sp, s) => {
  const sched = schedule(sp);
  for (const side of ["far", "near"]) {
    const items = [];
    for (const p of sched.filter((q) => q.side === side)) {
      if (p.make === "board") { items.push(flat(make.board(p), { x: p.x, z: p.z })); continue; }
      if (p.make === "tab") {
        const g = props.pullTab();
        g.position.set(p.x, 0, p.z);
        items.push(g);
        tabs.push({ group: g, beat: p.beat });
        continue;
      }
      const built = make[p.make](p);
      const content = built.content;
      let tilt = null, node = content;
      if (p.topple) {
        // in-plane topple about the bottom corner at x = pivot (the card stays in its hinge plane)
        const corner = new stage.THREE.Group();
        corner.position.x = p.topple.pivot;
        content.position.x -= p.topple.pivot;
        corner.add(content);
        node = corner;
        tilt = { group: corner, ...p.topple };
      }
      const pivot = standUp(node, { x: p.x, z: p.z, stem: built.stem ?? 0.18, stemColor: built.stemColor });
      pivot.name = p.id;
      items.push(pivot);
      pieces.push({ pivot, popAt: p.popAt, foldAt: p.foldAt, tilt });
    }
    props.stackPage(book.userData.anchor(s, side), items);
  }
});

const leaves = book.userData.leaves;
function renderAt(t) {
  const thetas = [], curls = [];
  for (let i = 0; i < leaves; i++) {
    thetas.push(motion.turn(t, flipAt(i), { dur: TIMING.turnDur }));
    curls.push(motion.curl(t, flipAt(i), { dur: TIMING.turnDur }));
  }
  book.userData.pose(thetas, curls);
  let breath = 0;
  for (let i = 0; i < leaves; i++) breath += motion.breath(t, flipAt(i), { dur: TIMING.turnDur });
  for (const pc of pieces) {
    const u = motion.hinge(t, pc.popAt, pc.foldAt, { foldDur: TIMING.foldDur });
    pc.pivot.userData.setOpen(u < 1e-4 ? breath : u); // flat pieces breathe up as a leaf sweeps past
    if (pc.tilt) {
      const k = ease.outBounce(clamp((t - tl.at(pc.tilt.beat, TIMING.triggerLag)) / 0.75));
      pc.tilt.group.rotation.z = pc.tilt.angle * k;
    }
  }
  for (const tb of tabs) tb.group.userData.setPull(motion.pull(t, tl.at(tb.beat), { dur: TIMING.pullDur }));
  rig.update(t);
  stage.render(t);
}

stage.mount(renderAt, { duration: DURATION, score: SCORE, duck: DUCK });
