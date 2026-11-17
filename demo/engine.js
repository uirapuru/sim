// Scrubbable scene timeline + control panel.
//
// A scene is a list of beats. Each beat has a narration key (optional) and an act(S, u, beat) that writes the
// state S for progress u in [0, 1] of that beat. evaluate(T) rebuilds S from a fresh initial state by running
// every beat that started before T (finished ones with u = 1), so any moment can be shown by itself: that is
// what makes the time slider, the scene buttons and "play from the start" behave the same way.
// Narration plays from HTMLAudio elements kept in sync with T; one-shot sounds (shot, gong) fire when playback
// crosses their time. Nothing here knows about the soldier or the rifle: scene1.js renders S.

export class Timeline {
  constructor({ beats, manifest, audioDir, audioQuery = "", init, sceneTitles, pad = 0.35 }) {
    this.beats = beats; this.init = init; this.sceneTitles = sceneTitles;
    const say = Object.fromEntries(manifest.map(m => [m.key, m]));
    let t = 0;
    for (const b of beats) {
      const m = b.say ? say[b.say] : null;
      if (b.say && !m) console.warn("no narration for", b.say);
      b.speech = m ? m.duration : 0; b.text = m ? m.text : ""; b.speaker = m ? m.speaker : null;
      b.dur = Math.max(b.dur || 0, b.speech + (b.say ? pad : 0), b.min || 0.1);
      b.start = t; t += b.dur;
      if (m) b.file = `${audioDir}/${m.file}${audioQuery}`;   // re-voiced clips keep their names: never take them from the cache
    }
    this.total = t;
    this.ac = new (window.AudioContext || window.webkitAudioContext)();
    this.src = null;                                   // {beat, node} currently speaking
    this.sceneStarts = {};
    for (const b of beats) if (!(b.scene in this.sceneStarts)) this.sceneStarts[b.scene] = b.start;
    this.scenes = Object.keys(this.sceneStarts).map(Number).sort((a, b) => a - b);
    this.T = 0; this.playing = false; this.events = []; this.listeners = [];
  }
  sceneAt(T) { let s = this.scenes[0]; for (const n of this.scenes) if (this.sceneStarts[n] <= T + 1e-6) s = n; return s; }
  beatAt(T) { let cur = this.beats[0]; for (const b of this.beats) if (b.start <= T) cur = b; return cur; }
  evaluate(T) {
    const S = this.init(); S.T = T; S.events = [];
    for (const b of this.beats) {
      if (b.start > T) break;
      const u = Math.min(1, (T - b.start) / b.dur);
      S.beat = b; S.scene = b.scene; S.tInBeat = T - b.start;
      this.beforeBeat && this.beforeBeat(S);          // per-shot things (overlays, camera) belong to one beat only
      b.act && b.act(S, u, b);
    }
    return S;
  }
  // sounds: S.events holds {t, kind}; fire the ones crossed between prev and T (only while playing forwards)
  step(dt) {
    const prev = this.T;
    if (this.playing) this.T = Math.min(this.total, this.T + dt);
    if (this.T >= this.total) this.playing = false;
    this.syncAudio();
    return prev;
  }
  // fetch and decode every narration clip before the scene starts, so no clip ever waits for the network
  async load(onProgress) {
    const todo = this.beats.filter(b => b.file); let done = 0;
    await Promise.all(todo.map(async b => {
      const buf = await (await fetch(b.file)).arrayBuffer();
      b.buffer = await this.ac.decodeAudioData(buf);
      onProgress && onProgress(++done / todo.length);
    }));
  }
  stopVoice() { if (this.src) { try { this.src.node.stop(); } catch (e) { } this.src = null; } }
  syncAudio() {
    const b = this.beatAt(this.T), off = this.T - (b ? b.start : 0);
    const want = this.playing && b && b.buffer && off >= 0 && off < b.speech ? b : null;
    if (!want) { this.stopVoice(); return; }
    if (this.src && this.src.beat === want) {         // keep it, unless it drifted from the timeline
      const played = this.ac.currentTime - this.src.t0 + this.src.off;
      if (Math.abs(played - off) < 0.25) return;
    }
    this.stopVoice();
    const node = this.ac.createBufferSource(); node.buffer = want.buffer; node.connect(this.ac.destination);
    node.start(0, off); this.src = { beat: want, node, t0: this.ac.currentTime, off };
  }
  seek(T) { this.T = Math.max(0, Math.min(this.total, T)); this.stopVoice(); this.syncAudio(); }
  play() { this.ac.resume(); if (this.T >= this.total - 0.05) this.T = 0; this.playing = true; this.syncAudio(); }
  pause() { this.playing = false; this.syncAudio(); }
}

const CSS = `
#demoPanel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 80; background: rgba(12,14,16,.88); color: #eee;
  font: 13px system-ui, sans-serif; padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 6px; }
#demoPanel .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
#demoPanel button { background: #2a2e33; color: #eee; border: 1px solid #444; border-radius: 4px; padding: 4px 9px; font: inherit; cursor: pointer; }
#demoPanel button:hover { background: #3a3f45; }
#demoPanel button.on { background: #f2c94c; color: #111; border-color: #f2c94c; }
#demoPanel .scn { min-width: 30px; }
#demoPanel input[type=range] { flex: 1; min-width: 160px; accent-color: #f2c94c; }
#demoPanel .time { font-family: monospace; min-width: 112px; text-align: right; }
#demoPanel .title { font-weight: 600; color: #f2c94c; }
#demoSub { position: fixed; left: 50%; transform: translateX(-50%); bottom: 112px; z-index: 79; max-width: min(900px, 90vw);
  background: rgba(0,0,0,.72); color: #fff; padding: 7px 14px; border-radius: 5px; font: 17px/1.35 system-ui, sans-serif; text-align: center; }
#demoSub.instr { color: #ffd84d; font-weight: 700; }
#demoSub:empty { display: none; }
`;

export function makePanel(tl, { onToggleLabels, onCamMode, title }) {
  const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
  const p = document.createElement("div"); p.id = "demoPanel";
  const sub = document.createElement("div"); sub.id = "demoSub";
  document.body.append(sub, p);
  const btn = (txt, title_, fn, cls = "") => { const b = document.createElement("button"); b.textContent = txt; b.title = title_; b.onclick = fn; if (cls) b.className = cls; return b; };
  const row1 = document.createElement("div"); row1.className = "row";
  const row2 = document.createElement("div"); row2.className = "row";
  const ttl = document.createElement("span"); ttl.className = "title";
  const start = btn("⏮ Od początku", "Cała scena od początku do końca", () => { tl.seek(0); tl.play(); });
  const prev = btn("‹", "Poprzednia scena", () => go(-1));
  const next = btn("›", "Następna scena", () => go(1));
  const playB = btn("▶", "Odtwórz / zatrzymaj (spacja)", () => tl.playing ? tl.pause() : tl.play());
  const scnBtns = tl.scenes.map(n => btn(String(n), tl.sceneTitles[n] || "", () => { tl.seek(tl.sceneStarts[n] + 0.001); }, "scn"));
  const slider = document.createElement("input"); slider.type = "range"; slider.min = 0; slider.max = tl.total; slider.step = 0.05; slider.value = 0;
  let dragging = false;
  slider.oninput = () => { dragging = true; tl.seek(+slider.value); };
  slider.onchange = () => { dragging = false; };
  const time = document.createElement("span"); time.className = "time";
  let labels = false, subs = true, free = false;
  const labB = btn("Etykiety", "Podpisy przy częściach wyposażenia", () => { labels = !labels; labB.classList.toggle("on", labels); onToggleLabels(labels); });
  const subB = btn("Napisy", "Tekst lektora na ekranie", () => { subs = !subs; subB.classList.toggle("on", subs); });
  subB.classList.add("on");
  const camB = btn("Kamera: scenariusz", "Przełącz na kamerę swobodną (przeciągnij, kółko)", () => { free = !free; camB.textContent = free ? "Kamera: swobodna" : "Kamera: scenariusz"; camB.classList.toggle("on", free); onCamMode(free); });
  row1.append(ttl);
  row2.append(start, prev, ...scnBtns, next, playB, slider, time, subB, labB, camB);
  p.append(row1, row2);
  function go(d) {
    const i = tl.scenes.indexOf(tl.sceneAt(tl.T)), n = tl.scenes[Math.max(0, Math.min(tl.scenes.length - 1, i + d))];
    tl.seek(tl.sceneStarts[n] + 0.001);
  }
  addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (e.code === "Space") { e.preventDefault(); tl.playing ? tl.pause() : tl.play(); }
    if (e.code === "ArrowRight" && e.shiftKey) go(1);
    if (e.code === "ArrowLeft" && e.shiftKey) go(-1);
  });
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return {
    update() {
      const n = tl.sceneAt(tl.T), b = tl.beatAt(tl.T);
      ttl.textContent = `${title} · scena ${n}/${tl.scenes.length}: ${tl.sceneTitles[n] || ""}`;
      scnBtns.forEach((x, i) => x.classList.toggle("on", tl.scenes[i] === n));
      playB.textContent = tl.playing ? "⏸" : "▶";
      if (!dragging) slider.value = tl.T;
      time.textContent = `${fmt(tl.T)} / ${fmt(tl.total)}`;
      const speaking = b && b.say && tl.T - b.start < b.speech + 0.3;
      sub.textContent = subs && speaking ? b.text : "";
      sub.className = b && b.speaker === "instructor" ? "instr" : "";
    },
    get labels() { return labels; }, get free() { return free; },
  };
}

// ---- 2D overlays (notebook, formula, range card, Kestrel screen, turret dial, scope mask) ----
export function overlayLayer() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;z-index:70;pointer-events:none";
  document.body.append(el);
  const cache = {};
  return {
    el,
    // show(id, html|null): put/replace an absolutely positioned box; null hides it. Re-renders only on change.
    show(id, html, css = "") {
      let box = cache[id];
      if (html == null) { if (box) box.style.display = "none"; return; }
      if (!box) { box = cache[id] = document.createElement("div"); el.append(box); }
      box.style.display = "block";
      if (box._css !== css) { box.style.cssText = "position:absolute;" + css; box._css = css; }
      if (box._html !== html) { box.innerHTML = html; box._html = html; }
    },
  };
}

// ---- sounds (WebAudio, no files) ----
export function sounds() {
  let ac = null;
  const ctx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
  return {
    shot() {
      const a = ctx(), n = a.sampleRate * 0.6, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * 0.07));
      const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2000;
      const g = a.createGain(); g.gain.value = 0.9; s.connect(f).connect(g).connect(a.destination); s.start();
    },
    ding() {
      const a = ctx(), g = a.createGain(); g.gain.setValueAtTime(0.3, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 1.6); g.connect(a.destination);
      for (const f of [1830, 2740, 4120]) { const o = a.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); o.stop(a.currentTime + 1.6); }
    },
    click() {
      const a = ctx(), n = a.sampleRate * 0.02, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * 0.002));
      const s = a.createBufferSource(); s.buffer = buf; const g = a.createGain(); g.gain.value = 0.25; s.connect(g).connect(a.destination); s.start();
    },
    unlock() { ctx().resume(); },
  };
}
