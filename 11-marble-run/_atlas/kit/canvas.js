// canvas.js — one place that decides how kit 2D canvases are created (pass 7, 2026-11-13). No THREE; Node-safe to import.
//
// Why: Chrome's GPU (accelerated) 2D canvas path rasterises large text and some paths slightly differently on each page
// load, so a canvas baked into a texture or overlay could change a few pixels between two renders of the same frame
// (newspaper-press shipped with it). A context created with { willReadFrequently: true } stays on Skia's CPU rasteriser,
// which is repeatable. The attribute only takes effect on the FIRST getContext("2d") call for a canvas, so the kit
// creates the context itself at canvas-creation time; later plain getContext("2d") calls (kit or style code) get the
// same CPU-backed context.
//
// Opt-out: every kit helper that creates a canvas takes { willReadFrequently: false }; CANVAS_DEFAULTS changes the
// default for the whole page (set it before building props; never per frame).

export const CANVAS_DEFAULTS = { willReadFrequently: true };

/** wrf(opt) -> the effective willReadFrequently flag for a helper call (explicit option wins over CANVAS_DEFAULTS). */
export const wrf = (opt) => (opt === undefined ? CANVAS_DEFAULTS.willReadFrequently !== false : !!opt);

/**
 * canvas2d(canvas, { willReadFrequently }) -> CanvasRenderingContext2D, created with the kit's attributes when this is
 * the first context for the canvas (otherwise the existing context is returned, as the DOM does).
 */
export function canvas2d(canvas, { willReadFrequently } = {}) {
  return wrf(willReadFrequently) ? canvas.getContext("2d", { willReadFrequently: true }) : canvas.getContext("2d");
}

/** newCanvas(w, h, opts) -> HTMLCanvasElement of that size whose 2D context already exists with the kit attributes. */
export function newCanvas(w, h = w, opts = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  canvas2d(c, opts);
  return c;
}
