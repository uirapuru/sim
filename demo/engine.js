// Scrubbable scene timeline + control panel.
//
// A scene is a list of beats. Each beat has a narration key (optional) and an act(S, u, beat) that writes the
// state S for progress u in [0, 1] of that beat. evaluate(T) rebuilds S from a fresh initial state by running
// every beat that started before T (finished ones with u = 1), so any moment can be shown by itself: that is
// what makes the time slider, the scene buttons and "play from the start" behave the same way.
// Narration plays from HTMLAudio elements kept in sync with T; one-shot sounds (shot, gong) fire when playback
// crosses their time. Nothing here knows about the soldier or the rifle: scene1.js renders S.

// One volume for the narration and the effects (shot, gong): 0..1 plus mute, remembered in this browser.
const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
export const volume = {
  level: readPref("sim.volume", 0.8), muted: readPref("sim.muted", false), subs: new Set(),
  get gain() { return this.muted ? 0 : this.level; },
  set(level, muted = this.muted) { this.level = Math.max(0, Math.min(1, level)); this.muted = muted;
    writePref("sim.volume", this.level); writePref("sim.muted", this.muted); this.subs.forEach(f => f(this.gain)); },
  bind(ac) { const g = ac.createGain(); g.gain.value = this.gain; g.connect(ac.destination); this.subs.add(v => g.gain.setTargetAtTime(v, ac.currentTime, 0.02)); return g; },
};

// The beginning of each clip was clipped (author, 18 XI): the clips start speaking at their first sample, and a clip
// was started a frame late (at its offset) or while the audio output was still waking up. Every clip gets LEAD s of
// silence in front, and a clip that starts late by less than START_SLACK plays from its beginning anyway.
export const LEAD = 0.5, START_SLACK = 0.1;   // the slack stays small: a clip behind by it still ends inside its beat (pad 0.35 s)
export function withLead(ac, buf, lead = LEAD) {
  const n = Math.round(lead * buf.sampleRate), out = ac.createBuffer(buf.numberOfChannels, buf.length + n, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c), n);
  return out;
}

export class Timeline {
  constructor({ beats, manifest, audioDir, audioQuery = "", init, sceneTitles, pad = 0.35 }) {
    this.beats = beats; this.init = init; this.sceneTitles = sceneTitles;
    const say = Object.fromEntries(manifest.map(m => [m.key, m]));
    let t = 0;
    for (const b of beats) {
      const m = b.say ? say[b.say] : null;
      if (b.say && !m) console.warn("no narration for", b.say);
      b.speech = m ? m.duration : 0; b.text = m ? m.text : ""; b.speaker = m ? m.speaker : null;
      b.dur0 = Math.max(b.dur || 0, b.min || 0);                // the action's own length, before the narration stretched it
      b.dur = Math.max(b.dur || 0, b.speech + (m ? LEAD : 0) + (b.say ? pad : 0), b.min || 0.1);   // the clip's silent lead fits in its beat
      b.start = t; t += b.dur;
      if (m) b.file = `${audioDir}/${m.file}${audioQuery}`;   // re-voiced clips keep their names: never take them from the cache
    }
    this.total = t;
    this.ac = new (window.AudioContext || window.webkitAudioContext)(); this.out = volume.bind(this.ac);
    this.src = null;                                   // {beat, node} currently speaking
    this.sceneStarts = {};
    for (const b of beats) if (!(b.scene in this.sceneStarts)) this.sceneStarts[b.scene] = b.start;
    this.scenes = Object.keys(this.sceneStarts).map(Number).sort((a, b) => a - b);
    this.T = 0; this.playing = false; this.events = []; this.listeners = [];
    this.voice = true; this.stopAt = null; this._done = null;   // training: narration off, play one step and stop
    // training (author, 18 XI): the instructor's commands still sound (minus the keys in skipVoice: the command the
    // question has just spoken), and beats stretched for a narration nobody hears run faster (fast)
    this.commands = false; this.skipVoice = new Set(); this.fast = false;
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
    if (this.playing) this.T = Math.min(this.total, this.T + dt * (window.__tlRate || 1) * (this.fast ? this.rateOf(this.beatAt(this.T)) : 1));   /* __tlRate: test hook, faster playback */
    if (this.stopAt != null && this.T >= this.stopAt) { this.T = this.stopAt; this.playing = false; this.stopAt = null; const d = this._done; this._done = null; d && d(); }
    if (this.T >= this.total) this.playing = false;
    this.syncAudio();
    return prev;
  }
  // fetch and decode every narration clip before the scene starts, so no clip ever waits for the network
  async load(onProgress) {
    const todo = this.beats.filter(b => b.file); let done = 0;
    await Promise.all(todo.map(async b => {
      const buf = await (await fetch(b.file)).arrayBuffer();
      b.buffer = withLead(this.ac, await this.ac.decodeAudioData(buf)); b.speech = b.buffer.duration;
      onProgress && onProgress(++done / todo.length);
    }));
  }
  heard(b) { return !!b && (this.voice || (this.commands && b.speaker === "instructor" && !this.skipVoice.has(b.say))); }
  // training pace: a beat as long as its narration is played up to 1.8x faster, but not under its own action length
  // (or 3 s); a command already spoken by the question goes by in about a second; heard commands keep their pace
  rateOf(b) {
    if (!b || this.heard(b)) return 1;
    if (b.speaker === "instructor") return Math.min(3, b.dur / 1.0);
    return Math.max(1, Math.min(1.8, b.dur / Math.max(b.dur0, 3.0)));
  }
  stopVoice() { if (this.src) { try { this.src.node.stop(); } catch (e) { } this.src = null; } }
  syncAudio() {
    const b = this.beatAt(this.T), off = this.T - (b ? b.start : 0);
    const want = this.heard(b) && this.playing && b.buffer && off >= 0 && off < b.speech + START_SLACK ? b : null;
    if (!want) { this.stopVoice(); return; }
    if (this.src && this.src.beat === want) {         // keep it, unless it drifted from the timeline
      const played = this.ac.currentTime - this.src.t0 + this.src.off;
      if (Math.abs(played - off) < 0.25) return;
    }
    this.stopVoice();
    // a clip entered late by a frame or two plays from its start (behind by that much: within the drift tolerance)
    const fresh = off < START_SLACK && !(this.src && this.src.beat === want), from = fresh ? 0 : off;
    const node = this.ac.createBufferSource(); node.buffer = want.buffer; node.connect(this.out);
    node.start(0, from); this.src = { beat: want, node, t0: this.ac.currentTime - (off - from), off: from };
  }
  seek(T) { this.T = Math.max(0, Math.min(this.total, T)); this.stopVoice(); this.syncAudio(); }
  play() { this.ac.resume(); if (this.T >= this.total - 0.05) this.T = 0; this.playing = true; this.syncAudio(); }
  pause() { this.playing = false; this.syncAudio(); }
  beatByKey(key) { const b = this.beats.find(b => b.say === key); if (!b) throw new Error("no beat " + key); return b; }
  // the frame before a step: the start of its first beat (or a given point u of a beat), paused
  holdAt(key, u = 0) { this.cancelRange(); const b = this.beatByKey(key); this.seek(b.start + Math.max(0.001, b.dur * u)); this.playing = false; this.syncAudio(); }
  // play from the start of beat fromKey up to the start of the next beat after toKey (beats without narration in
  // between are included), then pause; resolves then, or at once when cancelled or replaced
  playRange(fromKey, toKey) {
    this.cancelRange(); const a = this.beatByKey(fromKey), b = this.beatByKey(toKey);
    this.seek(a.start + 0.001); this.stopAt = Math.min(this.total, b.start + b.dur - 0.001);
    return new Promise(res => { this._done = res; this.play(); }); }
  cancelRange() { const was = this._done; this.stopAt = null; this._done = null; if (was) { this.playing = false; this.syncAudio(); } was && was(); }   // a cancelled step also stops
}

const CSS = `
#demoPanel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 80; background: rgba(12,14,16,.88); color: #eee;
  font: 13px system-ui, sans-serif; padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 6px; }
#demoPanel .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
#demoPanel button { background: #2a2e33; color: #eee; border: 1px solid #444; border-radius: 4px; padding: 4px 9px; font: inherit; cursor: pointer; }
#demoPanel button:hover { background: #3a3f45; }
#demoPanel button:disabled { opacity: .4; cursor: default; }
#demoPanel button.on { background: #f2c94c; color: #111; border-color: #f2c94c; }
#demoPanel .scn { min-width: 30px; }
#demoPanel input[type=range] { flex: 1; min-width: 160px; accent-color: #f2c94c; }
#demoPanel .time { font-family: monospace; min-width: 112px; text-align: right; }
#demoPanel .title { font-weight: 600; color: #f2c94c; }
#demoSub { position: fixed; left: 50%; transform: translateX(-50%); bottom: 112px; z-index: 79; max-width: min(900px, 90vw);
  background: rgba(0,0,0,.72); color: #fff; padding: 7px 14px; border-radius: 5px; font: 17px/1.35 system-ui, sans-serif; text-align: center; }
#demoPanel { background: rgba(12,14,16,.62); backdrop-filter: blur(3px); }
#demoPanel .vol { display: flex; align-items: center; gap: 4px; }
#demoPanel .vol input[type=range] { flex: none; width: 90px; min-width: 0; }
#lessonSide { position: fixed; top: 0; right: 0; bottom: 64px; width: 300px; max-width: 86vw; z-index: 85; background: rgba(12,14,16,.9); color: #eee;
  font: 14px system-ui, sans-serif; padding: 56px 14px 14px; box-sizing: border-box; transform: translateX(100%); transition: transform .2s;
  display: flex; flex-direction: column; }   /* only the chapter list scrolls; the tasks stay at the bottom edge */
#lessonSide .list { flex: 1; min-height: 0; overflow-y: auto; }
#lessonSide .foot { flex: none; padding-top: 4px; border-top: 1px solid #333; }
#lessonSide.open { transform: none; }
#lessonSide h3 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #aaa; }
#lessonSide h3.gap { margin-top: 10px; }
#lessonSide .lesson { font-weight: 600; color: #f2c94c; margin: 4px 0 8px; }
#lessonSide button { display: block; width: 100%; text-align: left; background: none; color: #ddd; border: 0; border-radius: 4px; padding: 6px 8px; font: inherit; cursor: pointer; }
#lessonSide button:hover { background: #2a2e33; }
#lessonSide button.on { background: #f2c94c; color: #111; }
#lessonSide button .n { display: inline-block; width: 26px; color: #888; }
#lessonSide button.on .n { color: #111; }
#lessonSide .tasks { display: flex; gap: 8px; }
#lessonSide .tasks button { text-align: center; border: 1px solid #555; }
#lessonSide .tasks button:disabled { opacity: .45; cursor: default; background: none; }
#sideToggle { position: fixed; top: 12px; right: 12px; z-index: 86; background: rgba(12,14,16,.75); color: #eee; border: 1px solid #555; border-radius: 6px;
  font: 18px system-ui; width: 40px; height: 36px; cursor: pointer; }
#startVeil { position: fixed; inset: 0; z-index: 150; display: grid; place-items: center; background: rgba(0,0,0,.35); }
#startVeil button { background: #f2c94c; color: #111; border: 0; border-radius: 10px; padding: 18px 42px; font: 700 24px system-ui; cursor: pointer;
  box-shadow: 0 6px 24px rgba(0,0,0,.45); }
#startVeil .tasks { display: flex; gap: 12px; justify-content: center; margin-top: 14px; }
#startVeil .tasks button { background: rgba(12,14,16,.85); color: #f2c94c; border: 2px solid #f2c94c; padding: 10px 26px; font: 600 18px system-ui; }
#startVeil .tasks button:hover { background: #f2c94c; color: #111; }
#startVeil .t { color: #fff; font: 600 18px system-ui; text-align: center; margin-bottom: 18px; text-shadow: 0 2px 6px #000; }
#demoSub.instr { color: #ffd84d; font-weight: 700; }
#demoSub:empty { display: none; }
`;

export function makePanel(tl, { onToggleLabels, onCamMode, title, lesson = title, onTask }) {
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
  let labels = false, subs = true, free = false, locked = false;
  const labB = btn("Etykiety", "Podpisy przy częściach wyposażenia", () => { labels = !labels; labB.classList.toggle("on", labels); onToggleLabels(labels); });
  const subB = btn("Napisy", "Tekst lektora na ekranie", () => { subs = !subs; subB.classList.toggle("on", subs); });
  subB.classList.add("on");
  // camera modes in turn: the script's shots, the shooter's own eyes (first person), free (drag, wheel, WSAD + QE)
  const MODES = [["script", "Kamera: scenariusz"], ["fpp", "Kamera: oczy strzelca"], ["free", "Kamera: swobodna"]]; let mode = 0;
  const camB = btn("Kamera: scenariusz", "Przełącz kamerę: scenariusz → oczy strzelca → swobodna", () => { mode = (mode + 1) % MODES.length; camB.textContent = MODES[mode][1]; camB.classList.toggle("on", mode > 0); onCamMode(MODES[mode][0]); });
  // volume: speaker (mute) + slider; M toggles mute
  const vol = document.createElement("span"); vol.className = "vol";
  const muteB = btn("", "Wycisz / włącz dźwięk (M)", () => volume.set(volume.level, !volume.muted));
  const volS = document.createElement("input"); volS.type = "range"; volS.min = 0; volS.max = 1; volS.step = 0.05; volS.title = "Głośność";
  volS.oninput = () => volume.set(+volS.value, false);
  const showVol = () => { muteB.textContent = volume.muted || volume.level === 0 ? "🔇" : volume.level < 0.5 ? "🔉" : "🔊"; volS.value = volume.muted ? 0 : volume.level; };
  volume.subs.add(showVol); showVol(); vol.append(muteB, volS);
  // full screen (no browser bars)
  const toggleFs = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
  const fsB = btn("⛶", "Pełny ekran (F)", toggleFs);
  row1.append(ttl);
  row2.append(start, prev, ...scnBtns, next, playB, slider, time, vol, subB, labB, camB, fsB);
  // side panel: the lesson (the whole scenario) with its chapters, and the tasks
  const side = document.createElement("div"); side.id = "lessonSide";
  const tog = document.createElement("button"); tog.id = "sideToggle"; tog.textContent = "✕"; tog.title = "Lekcje i zadania";
  side.classList.add("open");                                    // open by default (author, 18 XI)
  tog.onclick = () => { side.classList.toggle("open"); tog.textContent = side.classList.contains("open") ? "✕" : "☰"; };
  const list = document.createElement("div"); list.className = "list";
  list.innerHTML = `<h3>Lekcje</h3><div class="lesson">1. ${lesson}</div>`;
  const chBtns = tl.scenes.map(n => { const b = document.createElement("button"); b.innerHTML = `<span class="n">${n}</span>${tl.sceneTitles[n] || ""}`;
    b.title = "Rozdział " + n; b.onclick = () => { tl.seek(tl.sceneStarts[n] + 0.001); tl.play(); }; list.append(b); return b; });
  const th = document.createElement("h3"); th.className = "gap"; th.textContent = "Zadania";
  const tasks = document.createElement("div"); tasks.className = "tasks";
  for (const [k, t, h] of [["train", "Trening", "Samodzielne wykonanie kolejnych czynności"], ["exam", "Egzamin", "Na czas, bez podpowiedzi"]]) {
    const b = document.createElement("button"); b.textContent = t; b.title = onTask ? h : h + " (wkrótce)"; b.disabled = !onTask; b.onclick = () => onTask && onTask(k); tasks.append(b); }
  const foot = document.createElement("div"); foot.className = "foot"; foot.append(th, tasks);
  side.append(list, foot);
  document.body.append(side, tog);
  p.append(row1, row2);
  function go(d) {
    const i = tl.scenes.indexOf(tl.sceneAt(tl.T)), n = tl.scenes[Math.max(0, Math.min(tl.scenes.length - 1, i + d))];
    tl.seek(tl.sceneStarts[n] + 0.001);
  }
  addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" && e.target.type !== "range") return;
    if (e.code === "Space" && !locked) { e.preventDefault(); tl.playing ? tl.pause() : tl.play(); }
    if (e.code === "ArrowRight" && e.shiftKey && !locked) go(1);
    if (e.code === "ArrowLeft" && e.shiftKey && !locked) go(-1);
    if (e.code === "KeyM" && !e.ctrlKey) volume.set(volume.level, !volume.muted);
    if (e.code === "KeyF" && !e.ctrlKey && !e.repeat) toggleFs();
  });
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return {
    update() {
      const n = tl.sceneAt(tl.T), b = tl.beatAt(tl.T);
      ttl.textContent = `${title} · scena ${n}/${tl.scenes.length}: ${tl.sceneTitles[n] || ""}`;
      scnBtns.forEach((x, i) => x.classList.toggle("on", tl.scenes[i] === n));
      chBtns.forEach((x, i) => x.classList.toggle("on", tl.scenes[i] === n));
      playB.textContent = tl.playing ? "⏸" : "▶";
      if (!dragging) slider.value = tl.T;
      time.textContent = `${fmt(tl.T)} / ${fmt(tl.total)}`;
      const speaking = b && b.say && tl.T - b.start < b.speech + 0.3;
      sub.textContent = subs && speaking ? b.text : "";
      sub.className = b && b.speaker === "instructor" ? "instr" : "";
    },
    get labels() { return labels; }, get free() { return free; },
    setSubs(on) { subs = on; subB.classList.toggle("on", subs); },
    setLabels(on) { if (labels !== on) labB.click(); labB.disabled = false; },
    lockLabels(on) { labB.disabled = on; },
    // during a task the chapter bar, the slider and play are locked: the task drives the timeline
    setLocked(on) { for (const x of [start, prev, next, playB, slider, ...scnBtns, ...chBtns]) x.disabled = on; p.classList.toggle("locked", on); locked = on; },
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
  let out = null; const ctx = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); out = volume.bind(ac); } return ac; };
  return {
    shot() {
      const a = ctx(), n = a.sampleRate * 0.6, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * 0.07));
      const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2000;
      const g = a.createGain(); g.gain.value = 0.9; s.connect(f).connect(g).connect(out); s.start();
    },
    ding() {
      const a = ctx(), g = a.createGain(); g.gain.setValueAtTime(0.3, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 1.6); g.connect(out);
      for (const f of [1830, 2740, 4120]) { const o = a.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); o.stop(a.currentTime + 1.6); }
    },
    click() {
      const a = ctx(), n = a.sampleRate * 0.02, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * 0.002));
      const s = a.createBufferSource(); s.buffer = buf; const g = a.createGain(); g.gain.value = 0.25; s.connect(g).connect(out); s.start();
    },
    unlock() { ctx().resume(); },
  };
}

// big "Rozpocznij" in the middle: browsers allow sound only after a click, so the scene starts on it
// onTask(kind): optional, adds Trening and Egzamin under the start button (author, 18 XI)
export function startGate(title, onStart, onTask) {
  const v = document.createElement("div"); v.id = "startVeil";
  v.innerHTML = `<div><div class="t">${title}</div><div style="text-align:center"><button class="go">▶ Rozpocznij</button></div>` +
    (onTask ? `<div class="tasks"><button data-k="train" title="Samodzielne wykonanie kolejnych czynności">Trening</button><button data-k="exam" title="Na czas, bez podpowiedzi">Egzamin</button></div>` : "") + `</div>`;
  v.querySelector("button.go").onclick = () => { v.remove(); onStart(); };
  v.querySelectorAll(".tasks button").forEach(b => b.onclick = () => { v.remove(); onTask(b.dataset.k); });
  document.body.append(v); return v;
}
