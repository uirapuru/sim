// Training and exam over the lesson timeline (spec: docs/superpowers/specs/2026-11-18-training-exam-design.md).
// Per step: hold the frame, ask, grade (check.js), then the shooter does it (the step's beats, narration off).
// The conditions (range, wind) are drawn once per attempt; the shot is graded by where it lands with the
// student's own settings, and a miss sends him back to the settings.
// modules are loaded with this file's version query, so a new deploy never mixes with cached old ones
const V_ = new URL(import.meta.url).search;
const { withLead } = await import("../engine.js" + V_);
const [{ STEPS, ACTION_POOL, SECTIONS, sectionOf }, { resolve, checkAction, checkMark, checkNumber, checkWind, checkChoice, choiceOptions, optionsFor, scoreExam, parseNumber },
  { rollConditions, VIEW_CONDITIONS, tableDope, WEATHER, hourText }, { makeUi, f1 }] = await Promise.all(["steps_scene1", "check", "conditions", "ui"].map(n => import(`./${n}.js${V_}`)));

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
  // start dialog
  let from = 1;
  if (!exam) {
    const sel = document.createElement("div");
    sel.innerHTML = `<p>Wykonujesz procedurę sam, krok po kroku. Wskaż w scenie element i wybierz czynność, a przy zadaniach rachunkowych wpisz wynik. Gdy utkniesz, użyj „Daj podpowiedź”.</p>
      <p>Odległość do gongu, wiatr, godzina strzelania, pogoda, temperatura i ciśnienie są losowane na to podejście. Tabele balistyczne są dla 15 °C i 1010 hPa: w innych warunkach uwzględnij poprawkę.</p><label>Zacznij od rozdziału: <select>${SECTIONS.map(x => `<option value="${x.n}">${x.n}. ${x.title}</option>`).join("")}</select></label>`;
    const v = opts.from ?? await ui.modal("Trening", sel, [{ text: "Anuluj", value: null }, { text: "Start", main: true, value: () => +sel.querySelector("select").value }]);
    if (v == null) { ui.destroy(); return; } from = v;
  } else {
    const go = opts.from ?? await ui.modal("Egzamin", `<p>Całą procedurę wykonujesz sam, bez podpowiedzi. Masz ${Math.round((window.__examMs ?? EXAM_MS) / 60000) || "<1"} min. Zaliczenie od ${PASS}% poprawnych kroków.</p>
      <p>Każdy krok ma jedną próbę. Czy odpowiedź była dobra, zobaczysz w omówieniu na końcu. Odległość do gongu, wiatr, godzina strzelania, pogoda, temperatura i ciśnienie są losowane. Tabele balistyczne są dla 15 °C i 1010 hPa: w innych warunkach uwzględnij poprawkę.</p>`, [{ text: "Anuluj", value: null }, { text: "Start", main: true, value: 1 }]);
    if (go == null) { ui.destroy(); return; }
  }
  // the target is drawn somewhere the shooter can see it: no trees or ground on the line of sight (author, 19 XI)
  let c = opts.conditions || rollConditions();
  for (let k = 0; !opts.conditions && k < 60 && demo.sightBlocked && demo.sightBlocked(c); k++) c = rollConditions();
  let tick = null;
  try {
  await demo.setConditions(c); demo.setKestrelInset(c);
  const steps = exam ? STEPS : STEPS.filter(s => sectionOf(s.chapter).n >= from);
  panel.setLocked(true); panel.setSubs(false); tl.voice = false; tl.commands = true; tl.fast = true;
  if (exam) { panel.setLabels(false); panel.lockLabels(true); }

  let stopped = false, cancelAsk = null, timedOut = false;
  const answers = new Map(), log = new Map(), trainLog = new Map(); let shots = 0;
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
      say(exam && st.kind === "action" ? "_next" : st.id);
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
        ok.onclick = () => { if (!placed) return; const t = demo.cardTargetPx(c); if (!t) return; const dx = placed[0] - t.x, dy = placed[1] - t.y, given = `${Math.round(Math.hypot(dx, dy))} px od celu`;
          checkMark(st, dx, dy) ? right(given) : wrong(given); };
        view.body.append(ok); extraCleanup = () => dot.remove();
      } else if (st.kind === "wind") {
        // speed off the Kestrel and the side the wind blows from, in one answer (author, 19 XI)
        const inp = document.createElement("input"); inp.inputMode = "decimal"; const unit = document.createElement("span"); unit.textContent = "m/s";
        const box = document.createElement("div"); box.className = "choices"; box.style.flexBasis = "100%"; let from = null; const FROM = h => +h.match(/godziny (\d+)/)[1];
        for (const o of st.options) { const bt = document.createElement("button"); bt.textContent = o;
          bt.onclick = () => { from = FROM(o); for (const x of box.children) x.classList.toggle("main", x === bt); }; box.append(bt); }
        const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Zatwierdź";
        const submit = () => { if (parseNumber(inp.value) == null) { view.feedback("Wpisz prędkość wiatru.", "info"); return; }
          if (from == null) { view.feedback("Wybierz, skąd wieje wiatr.", "info"); return; }
          const g = `${inp.value} m/s, z godz. ${from}`; checkWind(st, inp.value, from, c) ? right(g) : wrong(g); };
        ok.onclick = submit; inp.onkeydown = e => { if (e.key === "Enter") submit(); };
        const lab = document.createElement("div"); lab.className = "dragTip"; lab.textContent = "Prędkość:"; const lab2 = document.createElement("div"); lab2.className = "dragTip"; lab2.textContent = "Skąd wieje:";
        view.body.append(lab, inp, unit, lab2, box, ok); setTimeout(() => inp.focus(), 50);
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
        // hold the left button 2 s at the right moment: the bar fills and the shot goes; letting go earlier resets it.
        // The reticle's offset at that moment is the shot's aim error (demo.setShotAim)
        const HOLD = 2000; let k = 0, t0 = null, raf = 0;
        const tip = document.createElement("div"); tip.className = "dragTip";
        tip.textContent = "Naciśnij lewy przycisk myszy i przytrzymaj 2 sekundy w odpowiednim do strzału momencie. Puszczony wcześniej – strzał nie pada i licznik startuje od zera.";
        const bar = document.createElement("div"); bar.className = "fireBar"; const fill = document.createElement("div"); bar.append(fill);
        const count = document.createElement("div"); count.className = "fireCount";
        const showCount = () => { count.textContent = st.shots.length > 1 ? `Strzał ${k + 1} z ${st.shots.length}` : ""; }; showCount();
        view.body.append(tip, bar, count); demo.setAimSway(true);
        const tick_ = () => { if (t0 == null || done) return; const f = Math.min(1, (performance.now() - t0) / HOLD); fill.style.width = (f * 100).toFixed(1) + "%";
          if (f >= 1) { t0 = null; fill.style.width = "0%"; const a = demo.aimNow(); demo.setShotAim(st.shots[k], a); fired.push(a); k++;
            if (k >= st.shots.length) { demo.setAimSway(false); const hit = st.shots.map(n => demo.shotResult(n).hit);
              finish({ ok: hit.every(Boolean), given: fired.map(([x, y]) => `${f1(Math.hypot(x, y))} mrad od środka`).join(", "), hinted, fireHits: hit }); return; }
            showCount(); view.feedback("Strzał oddany. Następny.", "info"); return; }
          raf = requestAnimationFrame(tick_); };
        const fired = [];
        onDown = e => { if (e.button !== 0 || e.target !== canvas) return; e.preventDefault(); t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick_); };
        onUp = () => { if (t0 != null) { t0 = null; fill.style.width = "0%"; } };
        addEventListener("pointerup", onUp, true);
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
      function cleanup() { voiceStop(); if (onMove) removeEventListener("pointermove", onMove, true); if (extraCleanup) extraCleanup(); if (st.kind === "fire") demo.setAimSway(false); if (onUp) removeEventListener("pointerup", onUp, true); if (onDown) removeEventListener("pointerdown", onDown, true); if (st.scopeDrag || st.kind === "find") demo.setScopeDrag(false); ui.clearMenu(); ui.hideCenter(); ui.hideRing(); demo.highlight(null); ui.hideNotes(); }
    });
  }
  function hint(st) {
    if (st.kind === "action" && !st.anywhere) demo.highlight(st.target);
    if (st.kind === "mark") { const t = demo.cardTargetPx(c); if (t) ui.ring(t.x + 6, t.y - 4, 26); }
    if (st.kind === "dial") { const d = tableDope(c, tab); ui.notes(tab); }
  }
  const correctText = st => {
    if (st.kind === "action") return st.anywhere ? st.action : `${demo.nameOf(st.target)} → ${st.action}`;
    if (st.kind === "choice") return resolve(st.correct, c);
    if (st.kind === "number") { const a = resolve(st.answer, c); return `${st.unit === "m" ? Math.round(a) : f1(a)} ${st.unit}`; }
    if (st.kind === "mark") return `cel na łuku ${c.range} m, na godzinie ${c.clock ?? 12}`;
    if (st.kind === "wind") return `${f1(c.wind)} m/s, ${resolve(st.correct, c).toLowerCase()}`;
    const d = tableDope(c, tab); return `ok. ${f1(d.elev)} ↑ · ${f1(Math.abs(d.wind))} ${d.wind >= 0 ? "L" : "P"}`;
  };

  // ---- the run ----
  const dialIdx = steps.findIndex(s => s.kind === "dial"); let retry = false;   // after a miss: settings, then straight to the shot
  for (let i = 0; i < steps.length && !stopped && !timedOut; i++) {
    const st = steps[i], hold = st.hold || { key: st.play[0], u: 0 };
    if (retry && st.kind !== "dial" && st.id !== "shot") continue;
    tl.holdAt(hold.key, hold.u); demo.setQuiz(true);
    const a = await ask(st, i, steps.length);
    demo.setQuiz(false);
    if (a && a.ok && !exam) await new Promise(r => setTimeout(r, 650));   /* let the green "Dobrze." be seen */
    ui.hideBar();
    if (!a) break;
    if (!answers.has(st.id)) { answers.set(st.id, a.ok); log.set(st.id, a.given); trainLog.set(st.id, a); }
    if (a.dial) demo.setDial(a.dial);
    // the question has just said the range command in the instructor's voice: the beat does not say it again
    const saidCmd = !(exam && st.kind === "action") && /^Komenda:/.test(typeof st.ask === "string" ? st.ask : "");   // the exam hides action questions
    tl.skipVoice = new Set(saidCmd ? [st.play[0]] : []);
    animT0 = performance.now(); await tl.playRange(st.play[0], st.play[st.play.length - 1]); animT0 = null; tl.skipVoice = new Set();
    if (stopped || timedOut) break;
    if (st.id === "shot") { shots++;
      if (!demo.shotResult(0).hit && dialIdx >= 0) {
        const view = ui.show({ meta: `Strzał ${shots}`, ask: "Pudło. Sprawdź nastawy i strzel jeszcze raz.", onQuit: quit }); say("_miss");
        view.feedback(exam ? "Popraw nastawy." : `Pocisk upadł ${demo.shotResult(0).y > 0 ? "za" : "przed"} celem lub obok. ${firstSentence(steps[dialIdx].hint)}`, "bad");
        await new Promise(r => setTimeout(r, 2200)); ui.hideBar();
        i = dialIdx - 1; retry = true; continue; }
      retry = false; }
  }
  clearInterval(tick);

  // ---- the end ----
  const finishedAll = !stopped;
  if (finishedAll) {
    if (exam) {
      const sc = scoreExam(steps, answers);
      const rows = steps.map((s, k) => { const ok = answers.get(s.id) === true, has = answers.has(s.id);
        return `<tr><td>${k + 1}</td><td>${s.kind === "action" ? (s.ask || "") : resolve(s.ask, c)}</td><td class="${ok ? "ok" : "bad"}">${has ? log.get(s.id) : "brak odpowiedzi"}</td><td>${correctText(s)}</td><td>${s.hint}</td></tr>`; }).join("");
      await ui.modal(sc.passed ? "Egzamin zaliczony" : "Egzamin niezaliczony",
        `<p><b>${sc.points}/${sc.total}</b> kroków poprawnie (${sc.percent}%), próg ${PASS}%. Czas: ${fmtTime(Math.min(window.__examMs ?? EXAM_MS, (window.__examMs ?? EXAM_MS) - (deadline - performance.now())))}${timedOut ? " (koniec czasu)" : ""}. Strzały do trafienia: ${shots || "–"}.</p>
         <p>Warunki: gong na ${c.range} m, wiatr ${f1(c.wind)} m/s z godz. ${c.windFrom}, godzina ${hourText(c.hour ?? 10)}, ${WEATHER[c.weather || "clear"]}, ${f1(c.temp ?? 15)} °C, ${c.pressure ?? 1010} hPa.</p>
         <table><tr><th>#</th><th>Polecenie</th><th>Twoja odpowiedź</th><th>Poprawnie</th><th>Wyjaśnienie</th></tr>${rows}</table>`, [{ text: "Zamknij", main: true, value: 1 }]);
      window.__lastExam = { ...sc, shots, timedOut, conditions: c };
    } else {
      // summary (author, 18 XI): right first time and without a hint = green, otherwise red; the settings step counts
      // as right when the first shot hit. Hits: the procedure's three shots with the final settings; 0/3 fails
      const nShots = steps.some(s => s.id === "repeat") ? 3 : steps.some(s => s.id === "shot") ? 1 : 0;
      const hits = Array.from({ length: nShots }, (_, n) => demo.shotResult(n).hit).filter(Boolean).length;
      const rows = steps.filter(s => trainLog.has(s.id)).map((s, k) => { const a = trainLog.get(s.id);
        const good = s.kind === "dial" ? shots === 1 : s.kind === "fire" ? (a.fireHits || []).every(Boolean) : !a.misses && !a.hinted;
        const why = s.kind === "dial" ? (good ? "" : `trafienie dopiero za ${shots}. strzałem`) : s.kind === "fire" ? `${(a.fireHits || []).filter(Boolean).length}/${(a.fireHits || []).length} w gong, siatka ${a.given}` : [a.misses ? `${a.misses} ${a.misses === 1 ? "błędna próba" : "błędne próby"}${a.firstWrong ? ` (najpierw: ${a.firstWrong})` : ""}` : "", a.hinted ? "z podpowiedzią" : ""].filter(Boolean).join(", ");
        return { good, html: `<li class="${good ? "ok" : "bad"}">${good ? "✓" : "✗"} ${s.kind === "action" ? (s.ask || "") : resolve(s.ask, c)}${why ? ` <span class="why">– ${why}</span>` : ""}</li>` }; });
      const nGood = rows.filter(r => r.good).length, nBad = rows.length - nGood, passed = !nShots || hits > 0;
      await ui.modal(passed ? "Trening zaliczony" : "Trening niezaliczony",
        `<p><b class="ok">${nGood} dobrze</b> · <b class="bad">${nBad} z błędem</b>${nShots ? ` · trafienia: <b>${hits}/${nShots}</b>` : ""}${nShots && !hits ? " – bez trafienia trening nie jest zaliczony" : ""}.</p>
         <p>Warunki: gong na ${c.range} m, wiatr ${f1(c.wind)} m/s z godz. ${c.windFrom}, godzina ${hourText(c.hour ?? 10)}, ${WEATHER[c.weather || "clear"]}, ${f1(c.temp ?? 15)} °C, ${c.pressure ?? 1010} hPa. Strzały do pierwszego trafienia: ${shots || "–"}.</p>
         <ul class="summary">${rows.map(r => r.html).join("")}</ul>`, [{ text: "Zamknij", main: true, value: 1 }]);
      window.__lastTrain = { nGood, nBad, hits, nShots, passed, shots, conditions: c };
    }
  }
  } finally {
  // ---- back to watching (also after an error) ----
  clearInterval(tick); voiceStop(); demo.setKestrelInset(null); ui.destroy(); tl.cancelRange(); tl.pause(); panel.setSubs(true); panel.setLocked(false); panel.lockLabels(false); demo.setQuiz(false); demo.highlight(null);
  try { await demo.setConditions(VIEW_CONDITIONS, true); } catch (e) { console.error(e); }
  tl.holdAt(STEPS[0].play[0], 0); tl.voice = true; tl.commands = false; tl.fast = false; tl.skipVoice = new Set();
  }
}
