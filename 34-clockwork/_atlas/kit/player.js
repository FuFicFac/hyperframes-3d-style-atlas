// player.js — standalone preview bar. Loaded ONLY by stage.mount() when isPreviewContext() is true,
// so it adds nothing to the DOM under HyperFrames render/inspect/studio.
// The rAF loop only *calls* renderAt(t); scene state still derives purely from t.
import { renderScore } from "./sound.js";

export function attachPlayer(api) {
  api.previewDriven = true;
  const dur = api.duration;
  let playing = false, t = 0, startWall = 0, startT = 0, soundOn = true;
  let ctx = null, sfxBuf = null, voBuf = null, sources = [];

  // fit the 1920x1080 composition into the window
  const root = document.querySelector("[data-composition-id]") || document.body;
  const fit = () => {
    const s = Math.min(innerWidth / api.stage.width, (innerHeight - 48) / api.stage.height);
    root.style.transformOrigin = "0 0";
    root.style.transform = `scale(${s})`;
    document.documentElement.style.overflow = document.body.style.overflow = "hidden";
    document.body.style.background = "#111";
  };
  addEventListener("resize", fit);
  fit();

  const bar = document.createElement("div");
  bar.id = "atlas-player";
  bar.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;height:48px;display:flex;gap:10px;align-items:center;padding:0 12px;" +
    "background:#16161a;color:#eee;font:13px/1 Menlo,monospace;z-index:2147483647;box-sizing:border-box";
  bar.innerHTML = `
    <button data-k="play" style="width:64px">Play</button>
    <input data-k="scrub" type="range" min="0" max="${dur}" step="0.001" value="0" style="flex:1">
    <span data-k="time" style="width:120px;text-align:right">0.00 / ${dur.toFixed(2)}</span>
    <label><input data-k="sound" type="checkbox" checked> sound</label>
    <label style="cursor:pointer">VO <input data-k="vo" type="file" accept="audio/*" style="width:150px"></label>`;
  document.body.appendChild(bar);
  const $ = (k) => bar.querySelector(`[data-k="${k}"]`);

  const show = (tt) => {
    t = Math.max(0, Math.min(dur, tt));
    api.renderAt(t);
    $("scrub").value = t;
    $("time").textContent = `${t.toFixed(2)} / ${dur.toFixed(2)}`;
  };

  function ensureAudio() {
    ctx ??= new AudioContext({ sampleRate: 48000 });
    if (!sfxBuf && api.score?.length) {
      const { left, right, sampleRate } = renderScore(api.score, { duration: dur, duck: api.meta.duck ?? [] });
      sfxBuf = ctx.createBuffer(2, left.length, sampleRate);
      sfxBuf.copyToChannel(left, 0);
      sfxBuf.copyToChannel(right, 1);
    }
  }
  function stopAudio() {
    sources.forEach((s) => { try { s.stop(); } catch {} });
    sources = [];
  }
  function startAudio(from) {
    stopAudio();
    if (!soundOn || !ctx) return;
    for (const b of [sfxBuf, voBuf]) {
      if (!b || from >= b.duration) continue;
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0, from);
      sources.push(s);
    }
  }
  const now = () => (ctx ? ctx.currentTime : performance.now() / 1000);

  function loop() {
    if (!playing) return;
    const tt = startT + (now() - startWall);
    if (tt >= dur) {
      show(dur);
      pause();
      return;
    }
    show(tt);
    requestAnimationFrame(loop);
  }
  function play() {
    ensureAudio();
    ctx.resume();
    if (t >= dur - 1e-3) t = 0;
    playing = true;
    startT = t;
    startWall = now();
    startAudio(t);
    $("play").textContent = "Pause";
    requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    stopAudio();
    $("play").textContent = "Play";
  }

  $("play").onclick = () => (playing ? pause() : play());
  $("scrub").oninput = (e) => {
    const was = playing;
    if (was) pause();
    show(+e.target.value);
    if (was) play();
  };
  $("sound").onchange = (e) => {
    soundOn = e.target.checked;
    if (playing) startAudio(t);
  };
  $("vo").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    ensureAudio();
    voBuf = await ctx.decodeAudioData(await f.arrayBuffer());
    if (playing) startAudio(t);
  };
  addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === "ArrowRight") show(t + 1 / 30);
    if (e.code === "ArrowLeft") show(t - 1 / 30);
  });
  show(0);
}
