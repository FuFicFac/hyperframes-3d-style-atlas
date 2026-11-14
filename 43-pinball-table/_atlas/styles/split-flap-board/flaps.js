// styles/split-flap-board/flaps.js — PURE split-flap layout + flip scheduling. No THREE, no window:
// imported by style.js (browser) AND by a scene's scene.config.js (Node) so the SCORE is generated
// from exactly the flip schedule the picture uses. Everything here is a pure function of its inputs.
//
// Board frame: board face = XY plane, hinge plane z = 0, +Z toward the viewer, origin = board centre.
// A "cell" is one split-flap module; its flap hinges about the horizontal axle through the cell centre.
import { hash01 } from "../../kit/time.js";

const PI = Math.PI;

/** Index of a character in the charset (unknown characters -> 0 = blank). */
export function charIndex(charset, ch) {
  const i = charset.indexOf(String(ch).toUpperCase());
  return i < 0 ? 0 : i;
}

/**
 * layoutBoard(def, B) -> layout (pure positions for every cell, slot, label and lamp)
 *   def: {
 *     header?: { cols, scale = 1.25 },                 // flipping title row (centred)
 *     columns: [{ id, cols, label? }],                 // column blocks of every data row, left to right
 *     rows: [{ id, label? }],                          // data rows, top to bottom
 *     footer?: { cols, scale = 1 },                    // flipping bottom line (centred)
 *     lamps = true, rowLabels = true
 *   }
 *   B: STYLE_SPEC.board (pitch, cellW, cellH, rowPitch, slotPad, blockGap, labelW, lampW, colLabelH, footerGap, margin)
 * Row ids "header" and "footer" address the title and bottom lines; their single block id is "text".
 */
export function layoutBoard(def, B) {
  const cols = def.columns ?? [];
  const lampsOn = def.lamps !== false, labelsOn = def.rowLabels !== false;
  const rowsW = cols.reduce((s, c) => s + c.cols * B.pitch, 0) + Math.max(0, cols.length - 1) * B.blockGap;
  const labelW = labelsOn ? B.labelW : 0.12, lampW = lampsOn ? B.lampW : 0.12;
  const gridW = labelW + rowsW + lampW;
  const hs = def.header?.scale ?? 1.25, fs = def.footer?.scale ?? 1;
  const slotH = (s) => B.cellH * s + 2 * B.slotPad[1];
  const headerH = def.header ? slotH(hs) + 0.12 : 0;
  const colLabelH = cols.some((c) => c.label) ? B.colLabelH : 0.1;
  const footerH = def.footer ? B.footerGap + slotH(fs) : 0;
  const nRows = def.rows.length;
  const height = 2 * B.margin[1] + headerH + colLabelH + nRows * B.rowPitch + footerH;
  const width = gridW + 2 * B.margin[0];
  const left = -gridW / 2, rowsCx = left + labelW + rowsW / 2;

  const cells = [], rows = {}, slots = [], labels = [], lamps = [];
  const addRow = (id, y, s, blocks, kind) => {
    const row = { id, y, s, kind, blocks: {}, order: 0 };
    for (const b of blocks) {
      const ids = [];
      for (let c = 0; c < b.cols; c++) {
        const i = cells.length;
        cells.push({ i, row: id, block: b.id, col: c, order: row.order++, x: b.x0 + (c + 0.5) * B.pitch * s, y, s });
        ids.push(i);
      }
      const x0 = b.x0 + (B.pitch * s - B.cellW * s) / 2 - B.slotPad[0], x1 = b.x0 + b.cols * B.pitch * s - (B.pitch * s - B.cellW * s) / 2 + B.slotPad[0];
      const h2 = slotH(s) / 2;
      slots.push({ row: id, block: b.id, x0, x1, y0: y - h2, y1: y + h2, kind });
      row.blocks[b.id] = { cells: ids, x0, x1, align: b.align ?? "left" };
    }
    rows[id] = row;
    return row;
  };

  let y = height / 2 - B.margin[1];
  let header = null;
  if (def.header) {
    const w = def.header.cols * B.pitch * hs;
    const cy = y - slotH(hs) / 2 - 0.02;
    addRow("header", cy, hs, [{ id: "text", cols: def.header.cols, x0: rowsCx - w / 2, align: "center" }], "header");
    header = { y0: cy - slotH(hs) / 2 - 0.1, y1: height / 2 - B.frameBar * 0.5 };
    y -= headerH;
  }
  // column labels (printed on the housing above each block)
  const blockX = [];
  let x = left + labelW;
  for (const c of cols) {
    blockX.push(x);
    if (c.label) labels.push({ text: c.label, x: x + (B.pitch - B.cellW) / 2, y: y - colLabelH / 2 - 0.01, align: "left", kind: "column" });
    x += c.cols * B.pitch + B.blockGap;
  }
  y -= colLabelH;
  def.rows.forEach((r, k) => {
    const cy = y - B.rowPitch / 2;
    addRow(r.id, cy, 1, cols.map((c, j) => ({ id: c.id, cols: c.cols, x0: blockX[j], align: c.align ?? "left" })), "data");
    if (labelsOn) labels.push({ text: r.label ?? String(k + 1).padStart(2, "0"), x: left + labelW * 0.42, y: cy, align: "center", kind: "row" });
    if (lampsOn) {
      const lx = left + labelW + rowsW + lampW / 2;
      (def.lampColors ?? ["amber", "green", "red"]).forEach((color, j, arr) => lamps.push({ row: r.id, color, x: lx + (j - (arr.length - 1) / 2) * (B.lampSpacing ?? 0.15), y: cy }));
    }
    y -= B.rowPitch;
  });
  if (def.footer) {
    y -= B.footerGap;
    const w = def.footer.cols * B.pitch * fs;
    addRow("footer", y - slotH(fs) / 2, fs, [{ id: "text", cols: def.footer.cols, x0: rowsCx - w / 2, align: "center" }], "footer");
  }
  return { width, height, gridW, rowsCx, cells, rows, slots, labels, lamps, header, B };
}

/** Pad/truncate text to n cells. align: "left" | "center" | "right". */
export function fitText(text, n, align = "left") {
  const s = String(text).toUpperCase().slice(0, n);
  const pad = n - s.length;
  const l = align === "center" ? Math.floor(pad / 2) : align === "right" ? pad : 0;
  return " ".repeat(l) + s + " ".repeat(pad - l);
}

/** Fresh plan: one segment list per cell (all cells start blank). */
export function createPlan(layout, charset, tune, seed = 1) {
  return { layout, charset, tune, seed, segs: layout.cells.map(() => []), items: [] };
}

const fallTime = (tune, rate) => tune.fallFrac / rate;

/**
 * addText(plan, { row, block = first, text, at, align? }) -> { start, arrive } (mutates plan; build time only)
 * Each cell steps FORWARD through the charset from its current character to the target, starting at
 * at + order·colStagger ± jitter (never before its previous segment has finished). Pure given the call order.
 */
export function addText(plan, item) {
  const { layout, charset, tune } = plan;
  const N = charset.length;
  const row = layout.rows[item.row];
  if (!row) throw new Error(`split-flap: unknown row "${item.row}"`);
  const blockId = item.block ?? Object.keys(row.blocks)[0];
  const block = row.blocks[blockId];
  if (!block) throw new Error(`split-flap: row "${item.row}" has no block "${blockId}"`);
  const k = plan.items.length;
  const str = fitText(item.text, block.cells.length, item.align ?? block.align);
  let first = Infinity, arrive = item.at;
  block.cells.forEach((ci, j) => {
    const cell = layout.cells[ci], segs = plan.segs[ci];
    const prev = segs[segs.length - 1];
    const from = prev ? prev.to : 0, to = charIndex(charset, str[j]);
    if (from === to) return;
    const rate = tune.rate * (1 + (hash01(plan.seed, ci, k, 11) * 2 - 1) * tune.rateJitter);
    let start = item.at + cell.order * tune.colStagger + (hash01(plan.seed, ci, k, 23) * 2 - 1) * tune.startJitter;
    if (prev) start = Math.max(start, prev.end);
    start = Math.max(0, start);
    const n = (to - from + N) % N;
    const land = start + (n - 1) / rate + fallTime(tune, rate);
    segs.push({ from, to, start, rate, n, land, end: land + tune.bounceHold });
    first = Math.min(first, start);
    arrive = Math.max(arrive, land);
  });
  const res = { ...item, block: blockId, text: str, start: Math.min(first, arrive), arrive };
  plan.items.push(res);
  return res;
}

/** planBoard(layout, program, charset, tune, seed) -> plan with every item scheduled in order. */
export function planBoard(layout, program, charset, tune, seed = 1) {
  const plan = createPlan(layout, charset, tune, seed);
  for (const it of program) addText(plan, it);
  return plan;
}

/** Flap angle while falling (u 0..1): gravity-like with an initial kick. 0 = up (top half), PI = down. */
const fallAngle = (u, tune) => PI * (tune.fallKick * u + (1 - tune.fallKick) * u * u);
/** Rebound off the stop, s seconds after landing. */
const bounceAngle = (s, tune) => PI - tune.bounceAmp * Math.exp(-tune.bounceDecay * s) * Math.abs(Math.sin((PI * s) / tune.bounceHalf));

/**
 * cellState(segs, t, charset, tune) -> { top, bottom, front, back, angle }   (PURE)
 *   top/bottom = glyph shown by the static top / bottom halves; front/back = glyphs on the moving flap;
 *   angle = flap rotation about the axle (0 up .. PI down), or null when no flap is moving (settled).
 * Physical mechanism: during a flip cur -> next, the static top already shows next's top half, the
 * static bottom still shows cur's bottom half, the falling flap carries cur's top half on its front and
 * next's bottom half on its back, so it completes the new character when it lands.
 */
export function cellState(segs, t, charset, tune) {
  const N = charset.length;
  let seg = null;
  for (let i = segs.length - 1; i >= 0; i--) if (segs[i].start <= t) { seg = segs[i]; break; }
  if (!seg) {
    const c = segs.length ? segs[0].from : 0;
    return { top: c, bottom: c, front: c, back: c, angle: null };
  }
  const e = t - seg.start;
  const k = Math.min(Math.floor(e * seg.rate), seg.n - 1);
  const s = e - k / seg.rate, fall = fallTime(tune, seg.rate);
  const cur = (seg.from + k) % N, next = (seg.from + k + 1) % N;
  let angle;
  if (s < fall) angle = fallAngle(s / fall, tune);
  else if (k < seg.n - 1 || s - fall < tune.bounceHold) angle = bounceAngle(s - fall, tune);
  else return { top: seg.to, bottom: seg.to, front: seg.to, back: seg.to, angle: null };
  return { top: next, bottom: cur, front: cur, back: next, angle };
}

/** Text a block shows at time t (settled characters, for checks/captions). */
export function blockText(plan, rowId, blockId, t) {
  const b = plan.layout.rows[rowId].blocks[blockId];
  return b.cells.map((ci) => plan.charset[cellState(plan.segs[ci], t, plan.charset, plan.tune).bottom]).join("");
}

/** flipEvents(plan) -> [{ t (flap lands on its stop), cell, row, x, s }] for every flip, sorted by t. */
export function flipEvents(plan) {
  const out = [];
  plan.segs.forEach((segs, ci) => {
    const cell = plan.layout.cells[ci];
    for (const g of segs) for (let k = 0; k < g.n; k++) out.push({ t: g.start + k / g.rate + fallTime(plan.tune, g.rate), cell: ci, row: cell.row, x: cell.x, s: cell.s });
  });
  return out.sort((a, b) => a.t - b.t || a.cell - b.cell);
}

/**
 * clatterScore(plan, opts) -> SCORE events (clack + click) whose density follows the flip schedule.
 *   Flips are binned per row into `bin`-second windows; each bin becomes one clack whose gain grows with
 *   sqrt(count), panned to the bin's mean x. opts: { bin = .025, gain = .16, maxGain = .55, click = .5, halfWidth }
 */
export function clatterScore(plan, o = {}) {
  const bin = o.bin ?? 0.025, g0 = o.gain ?? 0.16, gmax = o.maxGain ?? 0.55, half = o.halfWidth ?? plan.layout.width / 2;
  const bins = new Map();
  for (const ev of flipEvents(plan)) {
    const key = `${ev.row}|${Math.floor(ev.t / bin)}`;
    const b = bins.get(key) ?? { t: ev.t, n: 0, x: 0, s: ev.s, row: ev.row };
    b.n++;
    b.x += ev.x;
    bins.set(key, b);
  }
  const out = [];
  let k = 0;
  for (const b of [...bins.values()].sort((a, c) => a.t - c.t)) {
    const pan = Math.max(-0.85, Math.min(0.85, (b.x / b.n / half) * 0.85));
    const big = b.s > 1.05 ? 0.82 : 1; // larger header flaps sound lower
    const h = hash01(plan.seed, k++, 5);
    const gain = Math.min(gmax, g0 * Math.sqrt(b.n));
    out.push({ t: +b.t.toFixed(4), type: "clack", dur: 0.08, gain: +gain.toFixed(3), pitch: +((0.86 + h * 0.3) * big).toFixed(3), pan: +pan.toFixed(3), seed: k });
    if (o.click !== 0) out.push({ t: +(b.t + 0.004).toFixed(4), type: "click", gain: +(gain * (o.click ?? 0.5)).toFixed(3), pitch: +((0.75 + h * 0.4) * big).toFixed(3), pan: +pan.toFixed(3), seed: k + 7919 });
  }
  return out;
}
