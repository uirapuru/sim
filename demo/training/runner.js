// Training and exam over the lesson timeline (spec: docs/superpowers/specs/2026-11-18-training-exam-design.md).
// Per step: hold the frame, ask, grade (check.js), then the shooter does it (the step's beats, narration off).
// The conditions (range, wind) are drawn once per attempt; the shot is graded by where it lands with the
// student's own settings, and a miss sends him back to the settings.
// modules are loaded with this file's version query, so a new deploy never mixes with cached old ones
const V_ = new URL(import.meta.url).search;
const [{ STEPS, ACTION_POOL }, { resolve, checkAction, checkMark, checkNumber, checkChoice, choiceOptions, optionsFor, scoreExam, parseNumber },
  { rollConditions, VIEW_CONDITIONS, tableDope }, { makeUi, f1 }] = await Promise.all(["steps_scene1", "check", "conditions", "ui"].map(n => import(`./${n}.js${V_}`)));

const EXAM_MS = 15 * 60 * 1000, PASS = 80;
const firstSentence = t => (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
const fmtTime = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// ctx: { tl, panel, demo (window.__demo), tab (ballistics_table.json), canvas, chapterTitles }
export async function startTask(mode, ctx, opts = {}) {
  const { tl, panel, demo, tab, canvas, chapterTitles } = ctx, exam = mode === "exam", ui = makeUi();
  // start dialog
  let from = 1;
  if (!exam) {
    const sel = document.createElement("div");
    sel.innerHTML = `<p>Wykonujesz procedurę sam, krok po kroku. Wskaż w scenie element i wybierz czynność, a przy zadaniach rachunkowych wpisz wynik. Gdy utkniesz, użyj „Daj podpowiedź”.</p>
      <p>Odległość do gongu i wiatr są losowane na to podejście.</p><label>Zacznij od rozdziału: <select>${Object.entries(chapterTitles).map(([n, t]) => `<option value="${n}">${n}. ${t}</option>`).join("")}</select></label>`;
    const v = opts.from ?? await ui.modal("Trening", sel, [{ text: "Anuluj", value: null }, { text: "Start", main: true, value: () => +sel.querySelector("select").value }]);
    if (v == null) { ui.destroy(); return; } from = v;
  } else {
    const go = opts.from ?? await ui.modal("Egzamin", `<p>Całą procedurę wykonujesz sam, bez podpowiedzi. Masz ${Math.round((window.__examMs ?? EXAM_MS) / 60000) || "<1"} min. Zaliczenie od ${PASS}% poprawnych kroków.</p>
      <p>Każdy krok ma jedną próbę. Czy odpowiedź była dobra, zobaczysz w omówieniu na końcu. Odległość do gongu i wiatr są losowane.</p>`, [{ text: "Anuluj", value: null }, { text: "Start", main: true, value: 1 }]);
    if (go == null) { ui.destroy(); return; }
  }
  const c = opts.conditions || rollConditions();
  let tick = null;
  try {
  await demo.setConditions(c);
  const steps = exam ? STEPS : STEPS.filter(s => s.chapter >= from);
  panel.setLocked(true); panel.setSubs(false); tl.voice = false;
  if (exam) { panel.setLabels(false); panel.lockLabels(true); }

  let stopped = false, cancelAsk = null, timedOut = false;
  const answers = new Map(), log = new Map(); let shots = 0;
  // the exam clock runs only while a question waits: the shooter's animations do not count (review, 18 XI)
  let deadline = performance.now() + (window.__examMs ?? EXAM_MS), animT0 = null;
  const clock = exam ? ui.clock() : null;
  let timerEl = null; tick = setInterval(() => {
    if (!exam || animT0 != null) return; const left = deadline - performance.now(); clock.textContent = "⏱ " + fmtTime(left);
    if (left <= 0 && !timedOut) { timedOut = true; tl.cancelRange(); cancelAsk && cancelAsk(); } }, 250);
  const quit = () => { stopped = true; tl.cancelRange(); cancelAsk && cancelAsk(); };

  // ---- one question: resolves { ok, given } (or null when stopped / out of time) ----
  function ask(st, i, n) {
    return new Promise(res => {
      let done = false; const finish = v => { if (done) return; done = true; cleanup(); res(v); };
      cancelAsk = () => finish(null);
      window.__tkStep = { st, c, i };   /* test hook: the step being asked */
      const askText = exam && st.kind === "action" ? "Wykonaj następną czynność." : resolve(st.ask, c);
      const meta = `Krok ${i + 1}/${n} · rozdział ${st.chapter}: ${chapterTitles[st.chapter] || ""}`;
      let hinted = false;
      const view = ui.show({ meta, ask: askText, onQuit: quit, side: true, onHint: exam ? null : () => { hinted = true; view.feedback(st.hint, "info"); hint(st); } });
      timerEl = exam ? view.timer : null;
      const wrong = (text) => { if (exam) finish({ ok: false, given: text }); else view.feedback("Nie tym razem. " + firstSentence(st.hint), "bad"); };
      const right = given => { if (!exam) view.feedback("Dobrze.", "ok"); finish({ ok: true, given, hinted }); };
      let onDown = null;
      if (st.kind === "action") {
        onDown = async e => { if (e.button !== 0 || e.target !== canvas) return; const id = demo.pickAt(e.clientX, e.clientY);
          if (!id) { if (!exam) view.feedback("Tu nic nie ma. Kliknij element w scenie.", "info"); return; }
          const pick = await ui.menu(e.clientX, e.clientY, demo.nameOf(id), optionsFor(st, ACTION_POOL)); if (!pick || done) return;
          const r = checkAction(st, { target: id, action: pick }), given = `${demo.nameOf(id)} → ${pick}`;
          r === "ok" ? right(given) : wrong(given); };
      } else if (st.kind === "mark") {
        view.feedback("Kliknij na karcie ognia miejsce celu.", "info");
        onDown = e => { if (e.button !== 0) return; const t = demo.cardTargetPx(c); if (!t) return; const rb = t.box.getBoundingClientRect();
          if (e.clientX < rb.left || e.clientX > rb.right || e.clientY < rb.top || e.clientY > rb.bottom) return;
          const dx = e.clientX - t.x, dy = e.clientY - t.y, given = `${Math.round(Math.hypot(dx, dy))} px od celu`;
          checkMark(st, dx, dy) ? right(given) : wrong(given); };
      } else if (st.kind === "choice") {
        const box = document.createElement("div"); box.className = "choices";
        for (const o of choiceOptions(st, c)) { const b = document.createElement("button"); b.textContent = o; b.onclick = () => checkChoice(st, o, c) ? right(o) : wrong(o); box.append(b); }
        view.body.append(box);
      } else if (st.kind === "number") {
        const inp = document.createElement("input"); inp.inputMode = "decimal"; const unit = document.createElement("span"); unit.textContent = st.unit;
        const ok = document.createElement("button"); ok.className = "main"; ok.textContent = "Zatwierdź";
        const submit = () => { if (parseNumber(inp.value) == null) { view.feedback("Wpisz liczbę.", "info"); return; } const g = `${inp.value} ${st.unit}`; checkNumber(st, inp.value, c) ? right(g) : wrong(g); };
        ok.onclick = submit; inp.onkeydown = e => { if (e.key === "Enter") submit(); }; view.body.append(inp, unit, ok); setTimeout(() => inp.focus(), 50);
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
      function cleanup() { if (onDown) removeEventListener("pointerdown", onDown, true); ui.clearMenu(); ui.hideRing(); demo.highlight(null); ui.hideNotes(); }
    });
  }
  function hint(st) {
    if (st.kind === "action") demo.highlight(st.target);
    if (st.kind === "mark") { const t = demo.cardTargetPx(c); if (t) ui.ring(t.x + 6, t.y - 4, 26); }
    if (st.kind === "dial") { const d = tableDope(c, tab); ui.notes(tab); }
  }
  const correctText = st => {
    if (st.kind === "action") return `${demo.nameOf(st.target)} → ${st.action}`;
    if (st.kind === "choice") return resolve(st.correct, c);
    if (st.kind === "number") { const a = resolve(st.answer, c); return `${st.unit === "m" ? Math.round(a) : f1(a)} ${st.unit}`; }
    if (st.kind === "mark") return `cel na łuku ${c.range} m, w osi sektora`;
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
    if (!answers.has(st.id)) { answers.set(st.id, a.ok); log.set(st.id, a.given); }
    if (a.dial) demo.setDial(a.dial);
    animT0 = performance.now(); await tl.playRange(st.play[0], st.play[st.play.length - 1]); deadline += performance.now() - animT0; animT0 = null;
    if (stopped || timedOut) break;
    if (st.id === "shot") { shots++;
      if (!demo.shotResult(0).hit && dialIdx >= 0) {
        const view = ui.show({ meta: `Strzał ${shots}`, ask: "Pudło. Sprawdź nastawy i strzel jeszcze raz.", onQuit: quit });
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
         <p>Warunki: gong na ${c.range} m, wiatr ${f1(c.wind)} m/s z godz. ${c.windFrom}.</p>
         <table><tr><th>#</th><th>Polecenie</th><th>Twoja odpowiedź</th><th>Poprawnie</th><th>Wyjaśnienie</th></tr>${rows}</table>`, [{ text: "Zamknij", main: true, value: 1 }]);
      window.__lastExam = { ...sc, shots, timedOut, conditions: c };
    } else {
      await ui.modal("Trening ukończony", `<p>Gong stał na ${c.range} m, wiatr ${f1(c.wind)} m/s z godz. ${c.windFrom}. Strzały do pierwszego trafienia: ${shots}.</p>`, [{ text: "Zamknij", main: true, value: 1 }]);
    }
  }
  } finally {
  // ---- back to watching (also after an error) ----
  clearInterval(tick); ui.destroy(); tl.cancelRange(); tl.pause(); panel.setSubs(true); panel.setLocked(false); panel.lockLabels(false); demo.setQuiz(false); demo.highlight(null);
  try { await demo.setConditions(VIEW_CONDITIONS, true); } catch (e) { console.error(e); }
  tl.holdAt(STEPS[0].play[0], 0); tl.voice = true;
  }
}
