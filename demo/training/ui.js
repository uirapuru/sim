// DOM of the training and the exam: start dialog, prompt bar, action menu at the cursor, answer forms, the
// notebook with the ballistic tables, feedback, timer and the exam result. No grading here (check.js, runner.js).

const CSS = `
#tkBar { position: fixed; left: 50%; top: 52px; transform: translateX(-50%); z-index: 120; width: min(760px, calc(100vw - 120px));
  background: rgba(12,14,16,.9); color: #eee; border-radius: 8px; padding: 10px 14px; font: 15px/1.4 system-ui, sans-serif; box-shadow: 0 4px 18px rgba(0,0,0,.4); }
#tkBar.side { left: 16px; transform: none; width: min(480px, 42vw); }
#tkBar { cursor: grab; touch-action: none; }
#tkBar .meta { font-size: 12px; color: #aaa; display: flex; justify-content: space-between; gap: 10px; }
#tkBar .ask { font-size: 17px; font-weight: 600; margin: 4px 0 6px; }
#tkBar .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
#tkBar button, .tkMenu button, #tkModal button { background: #2a2e33; color: #eee; border: 1px solid #555; border-radius: 5px; padding: 6px 11px; font: inherit; cursor: pointer; }
#tkBar button:hover, .tkMenu button:hover, #tkModal button:hover { background: #3a3f45; }
#tkBar button.main, #tkModal button.main { background: #f2c94c; color: #111; border-color: #f2c94c; font-weight: 600; }
#tkBar input { background: #1b1e21; color: #fff; border: 1px solid #666; border-radius: 5px; padding: 6px 8px; font: inherit; width: 110px; }
#tkBar .fb { margin-top: 6px; font-weight: 600; min-height: 1em; }
#tkBar .fb.ok { color: #6fdc7c; } #tkBar .fb.bad { color: #ff7b72; } #tkBar .fb.info { color: #ffd84d; font-weight: 400; }
#tkBar .timer { font: 700 15px monospace; color: #f2c94c; }
#tkBar .choices { display: flex; flex-direction: column; gap: 6px; }
#tkBar .fireBar { flex-basis: 100%; height: 12px; background: #2a2e33; border: 1px solid #555; border-radius: 6px; overflow: hidden; margin: 4px 0; }
#tkBar .fireBar > div { height: 100%; width: 0; background: #f2c94c; }
#tkBar .fireCount { flex-basis: 100%; color: #ccc; font-size: 13px; }
#tkBar .dragTip { flex-basis: 100%; width: 100%; color: #ffd84d; font-weight: 600; margin: 2px 0 6px; }
#tkBar .choices button { text-align: left; }
.tkMenu { position: fixed; z-index: 130; background: rgba(12,14,16,.95); border: 1px solid #555; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 5px;
  font: 14px system-ui; color: #eee; max-width: 330px; }
.tkMenu .h { color: #f2c94c; font-weight: 600; margin-bottom: 2px; }
.tkMenu button { text-align: left; }
#tkNotes { position: fixed; right: 64px; top: 16px; z-index: 115; background: #f4f1e8; color: #1d2a40; border-radius: 6px; padding: 10px 14px;
  font: 14px/1.45 system-ui; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
#tkNotes table { border-collapse: collapse; } #tkNotes td, #tkNotes th { padding: 1px 9px; text-align: right; } #tkNotes th { font-size: 12px; color: #555; }
#tkNotes .t { font-weight: 700; margin-bottom: 4px; }
#tkCenter { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 118; pointer-events: none; background: rgba(12,14,16,.85);
  color: #ffd84d; font: 600 22px/1.35 system-ui; padding: 14px 26px; border-radius: 10px; text-align: center; box-shadow: 0 4px 18px rgba(0,0,0,.45); }
.tkDot { position: fixed; z-index: 126; display: none; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #c0242a; border: 2px solid #fff;
  pointer-events: none; box-shadow: 0 1px 2px rgba(0,0,0,.5); transition: transform .18s ease-out, box-shadow .18s ease-out; }
.tkDot.air { transform: translateY(-10px) scale(1.35); box-shadow: 0 16px 10px -2px rgba(0,0,0,.35); transition: none; }
#tkBar button:disabled { opacity: .45; cursor: default; }
#tkRing { position: fixed; z-index: 125; pointer-events: none; border: 3px solid #ffd84d; border-radius: 50%; box-shadow: 0 0 12px #ffd84d; }
#tkModal { position: fixed; inset: 0; z-index: 160; background: rgba(0,0,0,.55); display: grid; place-items: center; font: 15px/1.45 system-ui; }
#tkModal ul.summary { list-style: none; padding: 0; margin: 10px 0 0; }
#tkModal ul.summary li { padding: 4px 8px; border-radius: 4px; margin: 2px 0; }
#tkModal ul.summary li.ok { color: #7fdc8a; background: rgba(60,160,80,.12); }
#tkModal ul.summary li.bad { color: #ff8a80; background: rgba(200,60,50,.14); }
#tkModal ul.summary .why { color: #c9a; font-size: 13px; }
#tkModal b.ok { color: #7fdc8a; } #tkModal b.bad { color: #ff8a80; }
#tkModal .box { background: #15181b; color: #eee; border-radius: 10px; padding: 20px 24px; width: min(860px, calc(100vw - 32px)); max-height: 86vh; overflow: auto; }
#tkModal h2 { margin: 0 0 8px; color: #f2c94c; font-size: 20px; }
#tkModal select { background: #1b1e21; color: #fff; border: 1px solid #666; border-radius: 5px; padding: 6px; font: inherit; }
#tkModal table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
#tkModal td, #tkModal th { border-top: 1px solid #333; padding: 6px; vertical-align: top; text-align: left; }
#tkModal .ok { color: #6fdc7c; } #tkModal .bad { color: #ff7b72; }
`;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
export { f1 };

// drag a fixed box with the left mouse button (or a finger) by any spot that is not a control (author, 20 XI: on a
// small screen the question hid the Kestrel); once moved it keeps its place, clamped to the window
export function draggable(box, onMove) {
  let d = null;
  box.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest("button, input, select, textarea, label, a")) return;
    const r = box.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    box.setPointerCapture(e.pointerId); box.style.cursor = "grabbing"; e.preventDefault(); e.stopPropagation(); });
  box.addEventListener("pointermove", e => { if (!d) return;
    const r = box.getBoundingClientRect(), x = Math.max(0, Math.min(innerWidth - r.width, e.clientX - d.dx)), y = Math.max(0, Math.min(innerHeight - 40, e.clientY - d.dy));
    Object.assign(box.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto", transform: "none" }); onMove && onMove(x, y); });
  const end = () => { if (d) { d = null; box.style.cursor = ""; } };
  box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
}

export function makeUi() {
  if (!document.getElementById("tkCss")) { const st = el("style"); st.id = "tkCss"; st.textContent = CSS; document.head.append(st); }
  const bar = el("div"); bar.id = "tkBar"; bar.style.display = "none"; document.body.append(bar); draggable(bar);
  let ring = null, menu = null, notes = null;
  const clearMenu = () => { if (menu) { menu.remove(); menu = null; } };
  const api = {
    // modal with a title, html body and buttons [{ text, main, value }]; resolves with the value of the clicked button
    modal(title, body, buttons) {
      return new Promise(res => { const m = el("div"); m.id = "tkModal"; const box = el("div", "box", `<h2>${title}</h2>`); box.append(typeof body === "string" ? el("div", "", body) : body);
        const row = el("div", "", ""); row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:16px";
        for (const b of buttons) { const x = el("button", b.main ? "main" : "", b.text); x.onclick = () => { m.remove(); res(typeof b.value === "function" ? b.value() : b.value); }; row.append(x); }
        box.append(row); m.append(box); document.body.append(m); });
    },
    // the prompt bar: meta line (step, chapter, timer), question, a body for the answer, feedback line
    show({ meta, ask, onHint, onQuit, side = false }) {
      bar.style.display = "block"; bar.innerHTML = ""; bar.classList.toggle("side", side);   // side: left, clear of the range card
      const top = el("div", "meta"); const left = el("span", "", meta); const timer = el("span", "timer"); top.append(left, timer);
      const q = el("div", "ask", ask), body = el("div", "row"), fb = el("div", "fb"), tools = el("div", "row"); tools.style.marginTop = "8px";
      if (onHint) { const h = el("button", "", "Daj podpowiedź"); h.onclick = onHint; tools.append(h); }
      const quit = el("button", "", "Zakończ"); quit.onclick = onQuit; tools.append(quit);
      bar.append(top, q, body, fb, tools);
      return { body, timer, feedback(text, kind = "info") { fb.className = "fb " + kind; fb.textContent = text; } };
    },
    hideBar() { bar.style.display = "none"; clearMenu(); },
    // action menu at the cursor: header = the clicked part, options = actions; resolves with the picked action or null
    menu(x, y, header, options) {
      clearMenu(); return new Promise(res => { menu = el("div", "tkMenu"); menu.append(el("div", "h", header));
        for (const o of options) { const b = el("button", "", o); b.onclick = e => { e.stopPropagation(); clearMenu(); res(o); }; menu.append(b); }
        const c = el("button", "", "Anuluj"); c.style.color = "#aaa"; c.onclick = e => { e.stopPropagation(); clearMenu(); res(null); }; menu.append(c);
        document.body.append(menu); const r = menu.getBoundingClientRect();
        menu.style.left = Math.min(x + 12, innerWidth - r.width - 8) + "px"; menu.style.top = Math.min(y + 8, innerHeight - r.height - 80) + "px"; });
    },
    clearMenu,
    ring(x, y, r) { if (!ring) { ring = el("div"); ring.id = "tkRing"; document.body.append(ring); } Object.assign(ring.style, { left: x - r + "px", top: y - r + "px", width: 2 * r + "px", height: 2 * r + "px", display: "block" }); },
    // a hint in the middle of the screen; clicks go through it to the scene
    center(text) { let c = document.getElementById("tkCenter"); if (!c) { c = el("div"); c.id = "tkCenter"; document.body.append(c); } c.textContent = text; },
    hideCenter() { document.getElementById("tkCenter")?.remove(); },
    hideRing() { if (ring) ring.style.display = "none"; },
    // the shooter's notebook: ballistic table and wind table every 100 m (tab.table rows: [m, elev mrad, wind mrad per m/s])
    notes(tab) {
      if (!notes) { notes = el("div"); notes.id = "tkNotes";
        const rows = tab.table.map(([d, e, w]) => `<tr><td>${d}</td><td>${f1(e)}</td><td>${(Math.round(w * 100) / 100).toFixed(2).replace(".", ",")}</td></tr>`).join("");
        notes.innerHTML = `<div class="t">Tabela balistyczna · .308 175 gr</div><table><tr><th>odległość [m]</th><th>wysokość [mrad ↑]</th><th>wiatr [mrad na 1 m/s]</th></tr>${rows}</table>
          <div style="font-size:12px;color:#555;margin-top:6px">Wiatr pełny, z boku. Wiatr z lewej (godz. 9) → poprawka w lewo (L).</div>
          <div style="font-size:12px;color:#7a2a12;margin-top:4px;font-weight:600">Tabela dla 15 °C i 1010 hPa. W innych warunkach uwzględnij poprawkę: zimniej albo wyższe ciśnienie → powietrze gęstsze, pocisk spada bardziej.</div>`;
        document.body.append(notes); }
      notes.style.display = "block";
    },
    clock() { const k = el("div"); k.id = "tkClock"; k.style.cssText = "position:fixed;right:64px;top:14px;z-index:121;background:rgba(12,14,16,.9);color:#f2c94c;font:700 18px monospace;padding:6px 12px;border-radius:6px"; document.body.append(k); return k; },
    hideNotes() { if (notes) notes.style.display = "none"; },
    destroy() { document.getElementById("tkClock")?.remove(); document.getElementById("tkCenter")?.remove(); bar.remove(); clearMenu(); ring && ring.remove(); notes && notes.remove(); document.getElementById("tkModal")?.remove(); },
  };
  return api;
}
