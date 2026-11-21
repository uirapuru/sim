// Training and exam over the lesson timeline (spec: docs/superpowers/specs/2026-11-18-training-exam-design.md).
// Per step: hold the frame, ask, grade (check.js), then the shooter does it (the step's beats, narration off).
// The conditions (range, wind) are drawn once per attempt; the shot is graded by where it lands with the
// student's own settings, and a miss sends him back to the settings.
// modules are loaded with this file's version query, so a new deploy never mixes with cached old ones
const V_ = new URL(import.meta.url).search;
const { withLead } = await import("../engine.js" + V_);
const [{ STEPS, ACTION_POOL, SECTIONS, sectionOf, SCENARIOS, scenarioSteps }, { resolve, checkAction, checkMark, checkNumber, checkWind, checkChoice, choiceOptions, optionsFor, scoreExam, parseNumber },
  { rollConditions, rollTargets, VIEW_CONDITIONS, tableDope, WEATHER, hourText }, { makeUi, f1 }] = await Promise.all(["steps_scene1", "check", "conditions", "ui"].map(n => import(`./${n}.js${V_}`)));

const EXAM_MS = 45 * 60 * 1000, PASS = 80;   // author, 18 XI: 45 min for the whole exam, animations included
const firstSentence = t => (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// ctx: { tl, panel, demo (window.__demo), tab (ballistics_table.json), canvas, chapterTitles }
export async function startTask(mode, ctx, opts = {}) {
  const { tl, panel, demo, tab, canvas, chapterTitles } = ctx, exam = mode === "exam", ui = makeUi();
  // the questions are read out (author, 18 XI): clips from tools/narration/build_training_audio.py, the range commands
  // in the instructor's voice; through the scene's volume, stopped when the question is answered or left
  const VOICE = "demo/audio/training/", voiceBuf = new Map(); let voiceMan = null, voiceSrc = null, voiceGen = 0;
  const voiceStop = () => { voiceGen++; if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { } voiceSrc = null; } };
  async function say(id) {
    voiceStop(); const gen = voiceGen;
    try { voiceMan ??= await fetch(VOICE + "manifest.json" + V_).then(r => r.json()); } catch (e) { return; }
    for (const clip of voiceMan[id] || []) {
      if (gen !== voiceGen) return;
      let buf = voiceBuf.get(clip.file);
      if (!buf) { buf = await fetch(VOICE + clip.file + V_).then(r => r.arrayBuffer()).then(b => tl.ac.decodeAudioData(b)).then(b => withLead(tl.ac, b)); voiceBuf.set(clip.file, buf); }   // silence in front: the start is not lost
      if (gen !== voiceGen) return;
      tl.ac.resume(); const node = tl.ac.createBufferSource(); node.buffer = buf; node.connect(tl.out); voiceSrc = node;
      await new Promise(r => { node.onended = r; node.start(); });
      await new Promise(r => setTimeout(r, 150));
    } }
  // scenario 3: the recorded shooter's and spotter's lines (demo/audio/scene3)
  let s3man = null; const s3buf = new Map();
  async function say3(id) { try { s3man ??= await fetch("demo/audio/scene3/manifest.json" + V_).then(r => r.json()); const m = s3man[id]; if (!m) return;
    if (!s3buf.has(id)) s3buf.set(id, await fetch("demo/audio/scene3/" + m.file + V_).then(r => r.arrayBuffer()).then(b => tl.ac.decodeAudioData(b)));
    tl.ac.resume(); const n = tl.ac.createBufferSource(); n.buffer = s3buf.get(id); n.connect(tl.out); await new Promise(r => { n.onended = r; n.start(); }); } catch (e) { } }
  // start dialog
  let from = 1, scenario = 1;
  if (!exam) {
    const sel = document.createElement("div");
    sel.innerHTML = `<p>Wykonujesz procedurę sam, krok po kroku. Wskaż w scenie element i wybierz czynność, a przy zadaniach rachunkowych wpisz wynik. Gdy utkniesz, użyj „Daj podpowiedź”.</p>
      <p>Odległość do gongu, wiatr, godzina strzelania, pogoda, temperatura i ciśnienie są losowane na to podejście. Tabele balistyczne są dla 15 °C i 1010 hPa: w innych warunkach uwzględnij poprawkę.</p><label>Scenariusz: <select class="scn">${SCENARIOS.map(x => `<option value="${x.n}">${x.n}. ${x.title}</option>`).join("")}</select></label><br><br><label>Zacznij od rozdziału: <select class="from">${SECTIONS.map(x => `<option value="${x.n}">${x.n}. ${x.title}</option>`).join("")}</select></label>`;
    if (opts.scenario) { sel.querySelector(".scn").closest("label").remove(); sel.querySelector("br") && sel.querySelector("br").remove();
      if (opts.scenario !== 1) sel.querySelector(".from").closest("label").remove(); }   // chosen on the welcome screen; chapters only in scenario 1
    const v = opts.from != null ? { from: opts.from, scenario: opts.scenario ?? 1 } : await ui.modal("Trening", sel, [{ text: "Anuluj", value: null }, { text: "Start", main: true, value: () => ({ from: +(sel.querySelector(".from") || { value: 1 }).value, scenario: opts.scenario || +sel.querySelector(".scn").value }) }]);
    if (v == null) { ui.destroy(); return; } from = v.from; scenario = v.scenario;
  } else {
    const exSel = document.createElement("div"); exSel.innerHTML = `<p>Całą procedurę wykonujesz sam, bez podpowiedzi. Masz ${Math.round((window.__examMs ?? EXAM_MS) / 60000) || "<1"} min. Zaliczenie od ${PASS}% poprawnych kroków.</p>
      <p>Każdy krok ma jedną próbę. Czy odpowiedź była dobra, zobaczysz w omówieniu na końcu. Odległość do gongu, wiatr, godzina strzelania, pogoda, temperatura i ciśnienie są losowane. Tabele balistyczne są dla 15 °C i 1010 hPa: w innych warunkach uwzględnij poprawkę.</p><label>Scenariusz: <select class="scn">${SCENARIOS.map(x => `<option value="${x.n}">${x.n}. ${x.title}</option>`).join("")}</select></label>`;
    if (opts.scenario) exSel.querySelector(".scn").closest("label").remove();
    const go = opts.from != null ? { scenario: opts.scenario ?? 1 } : await ui.modal("Egzamin", exSel, [{ text: "Anuluj", value: null }, { text: "Start", main: true, value: () => ({ scenario: opts.scenario || +exSel.querySelector(".scn").value }) }]);
    if (go == null) { ui.destroy(); return; } scenario = go.scenario;
  }
  // the target is drawn somewhere the shooter can see it: no trees or ground on the line of sight (author, 19 XI)
  let c = opts.conditions || rollConditions();
  for (let k = 0; !opts.conditions && k < 60 && demo.sightBlocked && demo.sightBlocked(c); k++) c = rollConditions();
  // scenario 2: three targets, all in sight; the conditions of target t are the attempt's with its range and hour
  let targets = null; const c0 = c, cFor = t => ({ ...c0, ...targets[t], target: t });
  if (scenario === 2) { targets = opts.targets || rollTargets();
    for (let k = 0; !opts.targets && k < 80 && demo.sightBlocked && targets.some(t => demo.sightBlocked({ ...c0, ...t })); k++) targets = rollTargets();
    c = cFor(0); }
  const cAt = new Map();   // step id -> the conditions it was asked in (the targets differ)
  // scenario 2: what the trainee found for each target (his range and clock hour) - the range card in the corner while
  // shooting (author, 20 XI: top right, clear of the scope; the targets one under another)
  const own = [{}, {}, {}];
  const cornerHtml = () => { const P = (rng, h) => { const r = Math.min(1000, rng || 0) * 0.11, a = (h === 12 || h == null ? 0 : h === 11 ? -30 : h === 1 ? 30 : (h % 12) * 30) * Math.PI / 180; return [110 + r * Math.sin(a), 118 - r * Math.cos(a)]; };
    const arcs = [200, 400, 600, 800, 1000].map(d => { const r = d * 0.11; return `<path d="M ${110 - r} 118 A ${r} ${r} 0 0 1 ${110 + r} 118" fill="none" stroke="#9aa3b2" stroke-width="${d % 1000 ? 0.7 : 1.2}"/>`; }).join("");
    const dots = own.map((o, i) => { if (!o.range) return ""; const [x, y] = P(o.range, o.clock); return `<circle cx="${x}" cy="${y}" r="4.5" fill="#c0242a"/><text x="${x + 7}" y="${y + 4}" font-size="11" fill="#c0242a">${i + 1}</text>`; }).join("");
    const rows = own.map((o, i) => `<tr><td><b>${i + 1}</b></td><td>${o.range ? o.range + " m" : "–"}</td><td>${o.clock ? "godz. " + o.clock : "–"}</td></tr>`).join("");
    return `<div class="t">Karta ognia</div><svg width="220" height="124"><line x1="110" y1="118" x2="${110 - 110 * Math.sin(0.7)}" y2="${118 - 110 * Math.cos(0.7)}" stroke="#444"/><line x1="110" y1="118" x2="${110 + 110 * Math.sin(0.7)}" y2="${118 - 110 * Math.cos(0.7)}" stroke="#444"/>${arcs}<polygon points="110,113 106,121 114,121" fill="#1d2a40"/>${dots}</svg><table>${rows}</table>`; };
  let tick = null;
  try {
  await demo.setConditions(c); demo.setKestrelInset(c);
  // scenario 3: the pair in the forest; the range is the site's, the clock 12
  // scenario 3: the pair starts 1-3 half-metre moves to the left or right of the good place (author, 21 XI)
  const start3 = opts.start3 ?? (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3));
  if (scenario === 3) { await demo.setSite(3, c, start3); c = { ...c, range: demo.cond.range, bearing: 0, clock: 12 }; demo.setKestrelInset(c); }
  let curT = null; if (targets) { demo.setTargets(targets); demo.setRounds(6); curT = 0; await demo.activateTarget(0, c); }
  // scenario 2: six rounds for the three targets; when they run out, the targets left are skipped
  let ammo = targets ? 6 : Infinity, outOfAmmoAt = null;
  const all = scenarioSteps(scenario), from_ = scenario === 2 ? Math.min(from, 2) : scenario === 3 ? 1 : from;   // scenario 2 starts at the latest with the first target
  const steps = exam ? all : all.filter(s => sectionOf(s.chapter).n >= from_);
  panel.setLocked(true); panel.setSubs(false); tl.voice = false; tl.commands = true; tl.fast = true;
  if (exam) { panel.setLabels(false); panel.lockLabels(true); }

  let stopped = false, cancelAsk = null, timedOut = false;
  const answers = new Map(), log = new Map(), trainLog = new Map(); let shots = 0, fireHits = []; const fireBy = new Map();
  // the exam clock runs all the time, the shooter's animations included (about 11 min of the 45)
  let deadline = performance.now() + (window.__examMs ?? EXAM_MS), animT0 = null;
  const clock = exam ? ui.clock() : null;
  let timerEl = null; tick = setInterval(() => {
    if (!exam) return; const left = deadline - performance.now(); clock.textContent = "⏱ " + fmtTime(left);
    if (left <= 0 && !timedOut) { timedOut = true; tl.cancelRange(); cancelAsk && cancelAsk(); } }, 250);
  const quit = () => { stopped = true; tl.cancelRange(); cancelAsk && cancelAsk(); };

  // ---- one question: resolves { ok, given } (or null when stopped / out of time) ----
  function ask(st, i, n) {
    return new Promise(res => {
      let done = false; const finish = v => { if (done) return; done = true; cleanup(); res(v); };
      cancelAsk = () => finish(null);
      window.__tkStep = { st, c, i };   /* test hook: the step being asked */
      const askText = exam && st.kind === "action" ? "Wykonaj następną czynność." : resolve(st.ask, c);
      const sec = sectionOf(st.chapter), meta = `Krok ${i + 1}/${n} · rozdział ${sec.n}: ${sec.title} · ${chapterTitles[st.chapter] || ""}`;
      let hinted = false;
      say(exam && st.kind === "action" ? "_next" : st.voice ?? st.baseId ?? st.id);
      const view = ui.show({ meta, ask: askText, onQuit: quit, side: true, onHint: exam ? null : () => { hinted = true; view.feedback(st.hint, "info"); hint(st); } });
      timerEl = exam ? view.timer : null;
      // training: a wrong answer is counted (the summary marks the step red) and the student tries again
      let misses = 0, firstWrong = null;
      const wrong = (text) => { if (exam) finish({ ok: false, given: text }); else { misses++; firstWrong ??= text; view.feedback("Nie tym razem. " + firstSentence(st.hint), "bad"); } };
      const right = given => { if (!exam) view.feedback("Dobrze.", "ok"); finish({ ok: true, given, hinted, misses, firstWrong }); };
      let onDown = null, onUp = null, onMove = null, extraCleanup = null;
      if (st.kind === "action") {
        // anywhere: the first step teaches the menu, so a click on any spot opens it (author, 18 XI)
        if (st.anywhere) ui.center("Na początek kliknij gdziekolwiek na ekranie");
        // the element to click blinks yellow until it is clicked (author, 18 XI; the exam gives no such help)
        if (!exam && !st.anywhere) demo.highlight(st.target);
        onDown = async e => { if (e.button !== 0 || e.target !== canvas) return; const id = st.anywhere ? st.target : demo.pickAt(e.clientX, e.clientY);
          if (id === st.target) demo.highlight(null);
          if (!id) { if (!exam) view.feedback("Tu nic nie ma. Kliknij element w scenie.", "info"); return; }
          ui.hideCenter();
          const pick = await ui.menu(e.clientX, e.clientY, st.anywhere ? "Co robisz?" : demo.nameOf(id), optionsFor(st, ACTION_POOL)); if (!pick || done) return;
          const r = checkAction(st, { target: id, action: pick }), given = st.anywhere ? pick : `${demo.nameOf(id)} → ${pick}`;
          r === "ok" ? right(given) : wrong(given); };
      } else if (st.kind === "mark") {
        // the red point is carried in the air under the mouse and drops where the button is let go; it can be picked
        // up and moved again until "Zatwierdź" (author, 19 XI)
        view.feedback("Złap czerwony punkt albo naciśnij myszą na karcie, przenieś na miejsce celu i puść. Potem „Zatwierdź”.", "info");
        const dot = document.createElement("div"); dot.className = "tkDot"; document.body.append(dot);
        let placed = null, carrying = false;
        const inCard = (x, y) => { const t = demo.cardTargetPx(c); if (!t) return null; const rb = t.box.querySelector("svg").getBoundingClientRect();
          return x >= rb.left && x <= rb.right && y >= rb.top && y <= rb.bottom ? t : null; };
        const put = (x, y, air) => { dot.style.left = x + "px"; dot.style.top = y + "px"; dot.classList.toggle("air", air); dot.style.display = "block"; };
        const dotAt = (x, y) => placed && Math.hypot(x - placed[0], y - placed[1]) < 16;
        onDown = e => { if (e.button !== 0 || done) return; if (!inCard(e.clientX, e.clientY) && !dotAt(e.clientX, e.clientY)) return;
          e.preventDefault(); e.stopPropagation(); carrying = true; put(e.clientX, e.clientY, true); };
        onMove = e => { if (carrying) put(e.clientX, e.clientY, true); };
        onUp = e => { if (!carrying) return; carrying = false;
          if (inCard(e.clientX, e.clientY)) { placed = [e.clientX, e.clientY]; put(e.clientX, e.clientY, false); ok.disabled = false; }
          else if (placed) put(placed[0], placed[1], false); else dot.style.display = "none"; };
        addEventListener("pointermove", onMove, true); addEventListener("pointerup", onUp, true);
        const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Zatwierdź"; ok.disabled = true;
        ok.onclick = () => { if (!placed) return; const t = demo.cardTargetPx(c); if (!t) return;
          if (st.angleOnly) {   // scenario 2: only the direction counts on the card (author, 20 XI)
            const ang = (x, y) => Math.atan2(x - t.ox, t.oy - y) * 180 / Math.PI, d = Math.abs(ang(placed[0], placed[1]) - ang(t.x, t.y));
            const given = `${Math.round(d)}° od kierunku celu`; return d <= 8 && placed[1] < t.oy ? right(given) : wrong(given); }
          const dx = placed[0] - t.x, dy = placed[1] - t.y, given = `${Math.round(Math.hypot(dx, dy))} px od celu`;
          checkMark(st, dx, dy) ? right(given) : wrong(given); };
        view.body.append(ok); extraCleanup = () => dot.remove();
      } else if (st.kind === "sequence") {
        // the classic dialogue (scenario 3): the spotter's calls in random order; the trainee picks them in turn, the
        // shooter answers (author, 21 XI; sniperTAK FireDialogScript.CLASSIC)
        const lines = st.lines(c), echo = [ `Potwierdzam, człowiek na trybunie, ${c.ownRange ?? c.range} m.`, lines[1].replace(/^Podniesienie: /, ""), lines[2].replace(/^Wiatr: /, ""), null ];
        const talk = document.createElement("div"); talk.style.cssText = "flex-basis:100%;font:15px/1.5 system-ui;margin:4px 0";
        const box = document.createElement("div"); box.className = "choices"; box.style.flexBasis = "100%"; let k = 0;
        const order = [...lines]; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const add = (who, t) => { const d = document.createElement("div"); d.innerHTML = `<b style="color:${who === "Obserwator" ? "#9fd3ff" : "#f2c94c"}">${who}:</b> ${t}`; talk.append(d); };
        for (const o of order) { const b = document.createElement("button"); b.textContent = o;
          b.onclick = async () => { if (o !== lines[k]) { wrong(o); return; }
            b.disabled = true; add("Obserwator", o); const e = echo[k];
            if (e) add("Strzelec", e);
            if (k === 2) { add("Strzelec", "Strzelec gotowy."); say3("t_ready"); }
            k++; if (k === lines.length) right("dialog w kolejności"); }; box.append(b); }
        view.body.append(talk, box);
      } else if (st.kind === "wind") {
        if (demo.kestrelInsetSide) demo.kestrelInsetSide("right");   // the Kestrel is to be read: away from the question (author, 20 XI)
        // speed off the Kestrel and the side the wind blows from, in one answer (author, 19 XI)
        const inp = document.createElement("input"); inp.inputMode = "decimal"; const unit = document.createElement("span"); unit.textContent = "m/s";
        // the hour the wind blows from: twelve buttons in clock order (author, 20 XI: wind from any hour)
        const box = document.createElement("div"); box.style.cssText = "flex-basis:100%;display:grid;grid-template-columns:repeat(6,1fr);gap:6px"; let from = null;
        for (const h of st.hours) { const bt = document.createElement("button"); bt.textContent = `godz. ${h}`;
          bt.onclick = () => { from = h; for (const x of box.children) x.classList.toggle("main", x === bt); }; box.append(bt); }
        const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Zatwierdź";
        const submit = () => { if (parseNumber(inp.value) == null) { view.feedback("Wpisz prędkość wiatru.", "info"); return; }
          if (from == null) { view.feedback("Wybierz, skąd wieje wiatr.", "info"); return; }
          const g = `${inp.value} m/s, z godz. ${from}`; checkWind(st, inp.value, from, c) ? right(g) : wrong(g); };
        ok.onclick = submit; inp.onkeydown = e => { if (e.key === "Enter") submit(); };
        const lab = document.createElement("div"); lab.className = "dragTip"; lab.textContent = "Prędkość:"; const lab2 = document.createElement("div"); lab2.className = "dragTip"; lab2.textContent = "Skąd wieje:";
        view.body.append(lab, inp, unit, lab2, box, ok); setTimeout(() => inp.focus(), 50);
      } else if (st.kind === "position") {
        // three views to look through, three decisions; a move takes the pair half a metre aside (scene1 setSite)
        let k = demo.shift3, moves = 0, busy = false;
        const trouble = k => k <= -2 ? "W lunecie strzelca gałęzie zasłaniają trybunę." : k >= 2 ? "W lunecie obserwatora gałęzie zasłaniają trybunę."
          : k !== 0 ? "Obraz jest, ale przed lufą, na torze pocisku, wisi gałązka – zobacz widok wzdłuż lufy." : "";
        // both scopes on a split screen (author, 21 XI), or along the barrel
        const VIEWS = [["Lunety: strzelec | obserwator", () => { demo.showBoreLine(false); demo.setCam(null); tl.holdAt("s15.trigger", 0.6); demo.setSplit(true); }],
          ["Wzdłuż lufy", () => { demo.setSplit(false); tl.holdAt("s14.cmd", 0.5); demo.setCam(demo.barrelCam()); demo.showBoreLine(true); }]];
        // the bar goes to the top centre, in short rows: the two scopes below stay in sight
        const barEl = document.getElementById("tkBar"); barEl.classList.remove("side"); barEl.classList.add("top"); barEl.style.left = barEl.style.top = "";
        let view_ = 0; const vb = document.createElement("div"); vb.className = "choices row";
        const showView = i => { view_ = i; [...vb.children].forEach((b, j) => b.classList.toggle("on", j === i)); VIEWS[i][1](); };
        VIEWS.forEach(([t], i) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => showView(i); vb.append(b); });
        const lab = document.createElement("div"); lab.className = "dragTip"; lab.textContent = "Widok:";
        const lab2 = document.createElement("div"); lab2.className = "dragTip"; lab2.textContent = "Decyzja:";
        const db = document.createElement("div"); db.className = "choices row";
        const move = async d => { if (busy) return; const nk = k + d, txt = d > 0 ? "Pół metra w lewo" : "Pół metra w prawo";
          if (Math.abs(nk) > 3) { view.feedback("Dalej gęste krzaki – tam nie ma miejsca na stanowisko.", "info"); return; }
          if (Math.abs(nk) > Math.abs(k)) { if (exam) { finish({ ok: false, given: txt }); return; } misses++; firstWrong ??= txt; }
          busy = true; view.feedback(`Przesuwacie się ${d > 0 ? "w lewo" : "w prawo"}…`, "info"); await demo.setSite(3, c, nk); k = nk; moves++; busy = false; if (done) return;
          showView(view_); view.feedback(`Nowe miejsce (${moves}. przesunięcie). Sprawdź widoki.`, "info"); };
        const stay = () => { if (busy) return; const txt = "Zostajemy tutaj";
          if (k === 0) { right(moves ? `stanowisko po ${moves} ${moves === 1 ? "przesunięciu" : "przesunięciach"}` : txt); return; }
          if (exam) { finish({ ok: false, given: txt }); return; } misses++; firstWrong ??= txt; view.feedback("Nie tym razem. " + trouble(k), "bad"); };
        for (const [t, f] of [["Pół metra w lewo", () => move(1)], ["Pół metra w prawo", () => move(-1)], ["Zostajemy tutaj", stay]]) { const b = document.createElement("button"); b.textContent = t; b.onclick = f; db.append(b); }
        view.body.append(lab, vb, lab2, db); showView(0);
        extraCleanup = () => { barEl.classList.remove("top"); demo.setSplit(false); demo.showBoreLine(false); demo.setCam(null); demo.setScopeEye("shooter"); };
      } else if (st.kind === "choice") {
        const box = document.createElement("div"); box.className = "choices";
        for (const o of choiceOptions(st, c)) { const b = document.createElement("button"); b.textContent = o; b.onclick = () => checkChoice(st, o, c) ? right(o) : wrong(o); box.append(b); }
        view.body.append(box);
      } else if (st.kind === "number") {
        if (st.scopeDrag) { demo.setScopeDrag(true); const tip = document.createElement("div"); tip.className = "dragTip";
          tip.textContent = "Naciśnij LPM i poruszaj myszą, żeby ustawić siatkę do pomiaru."; view.body.append(tip); }
        const inp = document.createElement("input"); inp.inputMode = "decimal"; const unit = document.createElement("span"); unit.textContent = st.unit;
        const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Zatwierdź";
        const submit = () => { if (parseNumber(inp.value) == null) { view.feedback("Wpisz liczbę.", "info"); return; } const g = `${inp.value} ${st.unit}`; checkNumber(st, inp.value, c) ? right(g) : wrong(g); };
        ok.onclick = submit; inp.onkeydown = e => { if (e.key === "Enter") submit(); }; view.body.append(inp, unit, ok); setTimeout(() => inp.focus(), 50);
      } else if (st.kind === "find") {
        // search the ground with the scope and keep the cross on the gong for a moment: the step is done
        demo.setScopeDrag(true, { max: 120 });
        const tip = document.createElement("div"); tip.className = "dragTip";
        tip.textContent = "Naciśnij LPM i poruszaj myszą, żeby przesuwać lunetę. Szukaj pasami od bliska do daleka i najedź krzyżem na cel."; view.body.append(tip);
        let onSince = null; const poll = setInterval(() => { if (done) { clearInterval(poll); return; }
          const a = demo.aimOnGong(), on = Math.abs(a.yaw) <= a.hw + 0.3 && Math.abs(a.pitch) <= a.hh + 0.3;
          if (!on) { onSince = null; return; } onSince ??= performance.now();
          if (performance.now() - onSince > 600) { clearInterval(poll); demo.setScopeDrag(false); right("cel na krzyżu"); } }, 100);
      } else if (st.kind === "fire") {
        // live shooting (author, 20 XI): the breathing chart under the scope; while the left button is held the cross
        // follows the mouse (keep it on the target, the breath moves it); letting go fires. The bullet is seen in the
        // scope, then the gong from up close. After a hit the next shot at once; after a miss: change the settings or
        // keep them. After the last shot the Kestrel goes away until the end
        const tip = document.createElement("div"); tip.className = "dragTip";
        tip.textContent = "Naciśnij i trzymaj lewy przycisk myszy: krzyż idzie za myszą, trzymaj go na celu. Puść przycisk w pauzie po wydechu, wtedy pada strzał.";
        const count = document.createElement("div"); count.className = "fireCount"; const extra = document.createElement("div"); extra.className = "row"; extra.style.flexBasis = "100%";
        view.body.append(tip, count, extra);
        const n = st.shots.length, res = [], dials = []; let k = 0, held = null, busy = false, moving = 0;
        // scenario 3: the spotter's "Uwaga… Ognia." each time the instructor stops
        let wasStop = false; const cue = st.whenStopped ? setInterval(() => { if (done) { clearInterval(cue); return; } const s_ = demo.deckWalk().stop;
          if (s_ && !wasStop && !busy) { view.feedback("Obserwator: Uwaga… Ognia.", "ok"); say3("d12"); } if (!s_ && wasStop && !busy) view.feedback("Instruktor idzie – czekaj.", "info"); wasStop = s_; }, 150) : null;
        const nHit = () => res.filter(x => x.hit).length, nMiss = () => res.filter(x => !x.hit).length;
        const showCount = () => { count.textContent = st.stop ? `Cel nr ${st.tgt + 1} · strzał ${k + 1} · trafienia ${nHit()}/${st.stop.hits} · pudła ${nMiss()}/${st.stop.misses} · naboje: ${ammo}` : `Strzał ${k + 1} z ${n}`; };
        const over = () => k >= n || ammo <= 0 || (st.stop && (nHit() >= st.stop.hits || nMiss() >= st.stop.misses));
        const arm = () => { showCount(); demo.setAimSway(true); demo.breathChart(true); busy = false; };
        const choose = (text, buttons) => new Promise(r => { extra.innerHTML = ""; const q = document.createElement("div"); q.className = "dragTip"; q.textContent = text; extra.append(q);
          for (const [label, v, main] of buttons) { const b = document.createElement("button"); b.textContent = label; if (main) b.className = "main"; b.onclick = () => { extra.innerHTML = ""; r(v); }; extra.append(b); } });
        const newDial = () => new Promise(r => { extra.innerHTML = ""; ui.notes(tab); const d0 = demo.getDial();
          const mk = (label, unit, v) => { const w = document.createElement("label"); w.innerHTML = `${label} `; const i = document.createElement("input"); i.inputMode = "decimal"; i.value = f1(v); w.append(i, ` ${unit}`); return [w, i]; };
          const [we, ie] = mk("Wysokość ↑", "mrad", d0.elev), [ww, iw] = mk("Poprawka boczna", "mrad", Math.abs(d0.wind));
          let side = d0.wind >= 0 ? "L" : "P"; const sb = document.createElement("button"); const ss = () => sb.textContent = side === "L" ? "L (w lewo)" : "P (w prawo)"; ss(); sb.onclick = () => { side = side === "L" ? "P" : "L"; ss(); };
          const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Ustaw";
          ok.onclick = () => { const e = parseNumber(ie.value), w = parseNumber(iw.value); if (e == null || w == null) { view.feedback("Wpisz obie nastawy.", "info"); return; }
            const d = { elev: e, wind: side === "L" ? Math.abs(w) : -Math.abs(w) }; demo.setDial(d); dials.push(d); ui.hideNotes(); extra.innerHTML = ""; r(d); };
          extra.append(we, ww, sb, ok); });
        const where = r => { const v = r.y > 0.5 ? "wyżej" : r.y < -0.5 ? "niżej" : "", h = r.x > 0.25 ? "w prawo" : r.x < -0.25 ? "w lewo" : ""; return [v, h].filter(Boolean).join(" i ") || "tuż obok"; };
        onDown = e => { if (e.button !== 0 || e.target !== canvas || busy || done) return; e.preventDefault(); held = [e.clientX, e.clientY]; demo.setAimHold(true); };
        onMove = e => { if (!held) return; demo.aimNudge(e.clientX - held[0], e.clientY - held[1]); held = [e.clientX, e.clientY]; };
        onUp = async e => { if (!held) return; held = null;
          if (st.whenStopped && !demo.deckWalk().stop) { moving++; view.feedback("Instruktor idzie: strzał tylko na „Ognia.”, gdy stoi.", "bad"); demo.setAimHold(false); return; }
          busy = true; demo.breathChart(false);
          const r = await demo.fireLive(st.shots[k]); if (done) return; res.push(r); k++; ammo--; c.lastHit = r.hit;
          if (st.whenStopped && r.hit) { view.feedback("Obserwator: Cel zlikwidowany. Zbieramy łuskę i sprzęt, nie zostawiamy śladów.", "ok"); say3("d16").then(() => say3("d17")); }
          if (st.stop) count.textContent = `Cel nr ${st.tgt + 1} · trafienia ${nHit()}/${st.stop.hits} · pudła ${nMiss()}/${st.stop.misses} · naboje: ${ammo}`;   // the score at once
          if (over()) { demo.setAimSway(false); if (st.last !== false) demo.setKestrelInset(null);   // after the very last shot the Kestrel goes away
            const hits = res.filter(x => x.hit).length;
            if (st.stop) view.feedback(hits >= st.stop.hits ? "Cel trafiony dwa razy." : `Cel nr ${(st.tgt ?? 0) + 1} pozostaje nietrafiony.${st.last ? "" : " Przechodzisz do następnego celu."}`, hits >= st.stop.hits ? "ok" : "bad");
            if (ammo <= 0 && Number.isFinite(ammo)) { outOfAmmoAt = st.tgt ?? 0; demo.setKestrelInset(null); }
            if (st.stop) await new Promise(r => setTimeout(r, 1200)); if (done) return;
            if (cue) clearInterval(cue);
            finish({ ok: st.whenStopped ? hits >= 1 && !moving : hits >= 2, tgt: st.tgt ?? 0, given: (moving ? `${moving}× próba strzału do idącego; ` : "") + res.map((x, i) => `${i + 1}: ${x.hit ? "trafienie" : "pudło"}`).join(", "), hinted, fireHits: res.map(x => x.hit), dials }); return; }
          if (r.hit) { view.feedback("Trafienie. Następny strzał.", "ok"); arm(); return; }
          view.feedback(`Pudło: pocisk poszedł ${where(r)} od środka celu.`, "bad");
          const v = await choose(st.whenStopped ? "Obserwator: pudło. Podaj poprawkę – zmień nastawy albo zostaw." : "Zmieniasz nastawy na lunecie?", [["Zmień nastawy", "change", true], ["Zostaw nastawy", "keep", false]]); if (done) return;
          if (v === "change") await newDial(); if (done) return;
          view.feedback("Następny strzał.", "info"); arm(); };
        addEventListener("pointermove", onMove, true); addEventListener("pointerup", onUp, true);
        demo.setAimSway(true); demo.breathChart(true); showCount();
      } else if (st.kind === "dial") {
        ui.notes(tab);
        const mk = (label, unit) => { const w = document.createElement("label"); w.innerHTML = `${label} `; const i = document.createElement("input"); i.inputMode = "decimal"; w.append(i, ` ${unit}`); return [w, i]; };
        const [we, ie] = mk("Wysokość ↑", "mrad"), [ww, iw] = mk("Poprawka boczna", "mrad");
        let side = "L"; const sb = document.createElement("button"); const showSide = () => sb.textContent = side === "L" ? "L (w lewo)" : "P (w prawo)"; showSide(); sb.onclick = () => { side = side === "L" ? "P" : "L"; showSide(); };
        const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Ustaw";
        ok.onclick = () => { const e = parseNumber(ie.value), w = parseNumber(iw.value); if (e == null || w == null) { view.feedback("Wpisz obie nastawy.", "info"); return; }
          const dial = { elev: e, wind: side === "L" ? Math.abs(w) : -Math.abs(w) }; finish({ ok: true, given: `${f1(e)} ↑ · ${f1(Math.abs(w))} ${side}`, dial, hinted }); };
        view.body.append(we, ww, sb, ok);
      }
      if (onDown) addEventListener("pointerdown", onDown, true);
      function cleanup() { voiceStop(); if (onMove) removeEventListener("pointermove", onMove, true); if (extraCleanup) extraCleanup(); if (st.kind === "fire") { demo.setAimSway(false); demo.breathChart(false); ui.hideNotes(); } if (onUp) removeEventListener("pointerup", onUp, true); if (onDown) removeEventListener("pointerdown", onDown, true); if (st.scopeDrag || st.kind === "find") demo.setScopeDrag(false); ui.clearMenu(); ui.hideCenter(); ui.hideRing(); demo.highlight(null); ui.hideNotes(); }
    });
  }
  function hint(st) {
    if (st.kind === "action" && !st.anywhere) demo.highlight(st.target);
    if (st.kind === "mark") { const t = demo.cardTargetPx(c); if (t) ui.ring(t.x + 6, t.y - 4, 26); }
    if (st.kind === "dial") { const d = tableDope(c, tab); ui.notes(tab); }
  }
  const correctText = st => { const c = cAt.get(st.id) || c0;
    if (st.kind === "action") return st.anywhere ? st.action : `${demo.nameOf(st.target)} → ${st.action}`;
    if (st.kind === "choice") return resolve(st.correct, c);
    if (st.kind === "position") return "miejsce, z którego obie lunety widzą instruktora, a tor pocisku jest wolny";
    if (st.kind === "number") { const a = resolve(st.answer, c); return `${st.unit === "m" ? Math.round(a) : f1(a)} ${st.unit}`; }
    if (st.kind === "mark") return st.angleOnly ? `kierunek: godzina ${c.clock ?? 12}` : `cel na łuku ${c.range} m, na godzinie ${c.clock ?? 12}`;
    if (st.kind === "wind") return `${f1(c.wind)} m/s, ${resolve(st.correct, c).toLowerCase()}`;
    if (st.kind === "fire" || st.kind === "find") return "";
    if (st.kind === "sequence") return "cel z dystansem, podniesienie, wiatr (w milsach), „Obserwator gotowy.”";
    const d = tableDope(c, tab); return `ok. ${f1(d.elev)} ↑ · ${f1(Math.abs(d.wind))} ${d.wind >= 0 ? "L" : "P"}`;
  };
  // scenario 2: each target trafiony (two hits) or nietrafiony (two misses - also after one hit), or skipped
  const targetsText = () => !targets ? "" : `<p>${targets.map((t, i) => { const h = fireBy.get(i);
    const st_ = !h ? (outOfAmmoAt != null && i > outOfAmmoAt ? "pominięty – brak amunicji" : "nie strzelano") : h.filter(Boolean).length >= 2 ? `<b class="ok">trafiony</b> (${h.length} strz.)` : `<b class="bad">nietrafiony</b> (${plural(h.filter(Boolean).length, "trafienie", "trafienia", "trafień")}, ${plural(h.filter(x => !x).length, "pudło", "pudła", "pudeł")})`;
    return `Cel nr ${i + 1} (${t.range} m, godz. ${t.clock}): ${st_}`; }).join("<br>")}</p>`;
  const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
  const targetsHit = () => targets ? targets.filter((_, i) => (fireBy.get(i) || []).filter(Boolean).length >= 2).length : 0;
  const condText = () => `${targets ? `gongi na ${targets.map(t => t.range).join(", ")} m` : scenario === 3 ? `instruktor na trybunie, ${c.range} m` : `gong na ${c0.range} m`}, wiatr ${f1(c0.wind)} m/s z godz. ${c0.windFrom}, godzina ${hourText(c0.hour ?? 10)}, ${WEATHER[c0.weather || "clear"]}, ${f1(c0.temp ?? 15)} °C, ${c0.pressure ?? 1010} hPa`;

  // ---- the run ----
  for (let i = 0; i < steps.length && !stopped && !timedOut; i++) {
    const st = steps[i], hold = st.hold || { key: st.play[0], u: 0 };
    if (outOfAmmoAt != null && st.tgt != null && st.tgt > outOfAmmoAt) continue;
    if (targets && st.tgt != null && st.tgt !== curT) { curT = st.tgt; c = cFor(curT); await demo.activateTarget(curT, c); }
    cAt.set(st.id, c);
    if (targets && st.baseId === "card") demo.setCardTargets(own.slice(0, st.tgt).map((o, i) => ({ range: o.range ?? targets[i].range, bearing: targets[i].bearing, n: i + 1 })));
    if (targets && st.corner) ui.corner(cornerHtml()); else ui.hideCorner();
    tl.holdAt(hold.key, hold.u); demo.setQuiz(true);
    const a = await ask(st, i, steps.length);
    demo.setQuiz(false);
    if (st.kind === "position" && demo.shift3 !== 0) await demo.setSite(3, c, 0);   // the exam's wrong answer: the rest from the good place
    if (a && a.ok && !exam) await new Promise(r => setTimeout(r, 650));   /* let the green "Dobrze." be seen */
    ui.hideBar();
    if (!a) break;
    if (!answers.has(st.id)) { answers.set(st.id, a.ok); log.set(st.id, a.given); trainLog.set(st.id, a); }
    if (a.dial) demo.setDial(a.dial);
    if (scenario === 3) { if (st.baseId === "range" && a.ok) c.ownRange = Math.round(parseNumber(a.given)); if (st.call && a.dial) c.call = a.dial; }
    if (targets && st.tgt != null && a.ok) { if (st.baseId === "range") own[st.tgt].range = Math.round(parseNumber(a.given)); if (st.baseId === "direction") own[st.tgt].clock = +String(a.given).replace(/\D+/g, ""); }
    if (a.fireHits) { fireBy.set(a.tgt ?? 0, a.fireHits); fireHits = [...fireBy.values()].flat(); const f = (fireBy.get(0) || []).indexOf(true); shots = f < 0 ? 0 : f + 1; }   // shots to the first hit
    // the question has just said the range command in the instructor's voice: the beat does not say it again
    const saidCmd = !(exam && st.kind === "action") && /^Komenda:/.test(typeof st.ask === "string" ? st.ask : "");   // the exam hides action questions
    tl.skipVoice = new Set(saidCmd ? [st.play[0]] : []);
    if (st.play.length) { animT0 = performance.now(); await tl.playRange(st.play[0], st.play[st.play.length - 1]); animT0 = null; } tl.skipVoice = new Set();   // no animation after some steps (scenario 3, the place)
    if (stopped || timedOut) break;
  }
  clearInterval(tick);

  // ---- the end ----
  const finishedAll = !stopped;
  if (finishedAll) {
    if (exam) {
      const sc = scoreExam(steps, answers);
      const rows = steps.map((s, k) => { const ok = answers.get(s.id) === true, has = answers.has(s.id);
        return `<tr><td>${k + 1}</td><td>${s.kind === "action" ? (s.ask || "") : resolve(s.ask, cAt.get(s.id) || c0)}</td><td class="${ok ? "ok" : "bad"}">${has ? log.get(s.id) : "brak odpowiedzi"}</td><td>${correctText(s)}</td><td>${s.hint}</td></tr>`; }).join("");
      await ui.modal(sc.passed ? "Egzamin zaliczony" : "Egzamin niezaliczony",
        `${targetsText()}<p><b>${sc.points}/${sc.total}</b> kroków poprawnie (${sc.percent}%), próg ${PASS}%. Czas: ${fmtTime(Math.min(window.__examMs ?? EXAM_MS, (window.__examMs ?? EXAM_MS) - (deadline - performance.now())))}${timedOut ? " (koniec czasu)" : ""}. Strzały do trafienia: ${shots || "–"}.</p>
         <p>Warunki: ${condText()}.</p>
         <table><tr><th>#</th><th>Polecenie</th><th>Twoja odpowiedź</th><th>Poprawnie</th><th>Wyjaśnienie</th></tr>${rows}</table>`, [{ text: "Zamknij", main: true, value: 1 }]);
      window.__lastExam = { ...sc, shots, timedOut, conditions: c };
    } else {
      // summary (author, 18 XI): right first time and without a hint = green, otherwise red; the settings step counts
      // as right when the first shot hit. Hits: the procedure's three shots with the final settings; 0/3 fails
      const nShots = fireHits.length, hits = fireHits.filter(Boolean).length;
      const rows = steps.filter(s => trainLog.has(s.id)).map((s, k) => { const a = trainLog.get(s.id);
        const good = s.kind === "dial" ? (fireBy.get(s.tgt ?? 0) || [])[0] === true : s.kind === "fire" ? (a.fireHits || []).filter(Boolean).length >= 2 : !a.misses && !a.hinted;
        const why = s.kind === "dial" ? (good ? "" : shots ? `trafienie dopiero za ${shots}. strzałem` : "żaden strzał nie trafił") : s.kind === "fire" ? `${(a.fireHits || []).filter(Boolean).length}/${(a.fireHits || []).length} w gong (${a.given})` : [a.misses ? `${a.misses} ${a.misses === 1 ? "błędna próba" : "błędne próby"}${a.firstWrong ? ` (najpierw: ${a.firstWrong})` : ""}` : "", a.hinted ? "z podpowiedzią" : ""].filter(Boolean).join(", ");
        return { good, html: `<li class="${good ? "ok" : "bad"}">${good ? "✓" : "✗"} ${s.kind === "action" ? (s.ask || "") : resolve(s.ask, cAt.get(s.id) || c0)}${why ? ` <span class="why">– ${why}</span>` : ""}</li>` }; });
      const nGood = rows.filter(r => r.good).length, nBad = rows.length - nGood, passed = !nShots || hits > 0;
      await ui.modal(passed ? "Trening zaliczony" : "Trening niezaliczony",
        `<p><b class="ok">${nGood} dobrze</b> · <b class="bad">${nBad} z błędem</b>${targets ? ` · cele trafione: <b>${targetsHit()}/3</b>` : nShots ? ` · trafienia: <b>${hits}/${nShots}</b>` : ""}${nShots && !hits ? " – bez trafienia trening nie jest zaliczony" : ""}.</p>
         <p>Warunki: ${condText()}.${targets ? "" : ` Strzały do pierwszego trafienia: ${shots || "–"}.`}</p>${targetsText()}
         <ul class="summary">${rows.map(r => r.html).join("")}</ul>`, [{ text: "Zamknij", main: true, value: 1 }]);
      window.__lastTrain = { nGood, nBad, hits, nShots, passed, shots, conditions: c };
    }
  }
  } finally {
  // ---- back to watching (also after an error) ----
  clearInterval(tick); voiceStop(); demo.setKestrelInset(null); demo.setCardTargets && demo.setCardTargets([]); ui.destroy(); tl.cancelRange(); tl.pause(); panel.setSubs(true); panel.setLocked(false); panel.lockLabels(false); demo.setQuiz(false); demo.highlight(null);
  try { if (scenario === 3) await demo.setSite(1); await demo.setConditions(VIEW_CONDITIONS, true); } catch (e) { console.error(e); }
  tl.holdAt(STEPS[0].play[0], 0); tl.voice = true; tl.commands = false; tl.fast = false; tl.skipVoice = new Set();
  }
}
