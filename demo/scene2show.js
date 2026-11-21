// Scenario 2, lesson (author, 21 XI 2026): three gongs, from the nearest to the farthest, two shots at each. The
// phases of the training: find all three, measure each from its height, the wind, the directions, the range card, then
// the shooting target by target. Fixed conditions (the narration speaks no numbers; the overlays show them).
const V_ = new URL(import.meta.url).search;
const { VIEW_CONDITIONS } = await import("./training/conditions.js" + V_);
const BASE = { wind: 3, windFrom: 9, hour: 11, weather: "clear", temp: 15, pressure: 1010 };
const TARGETS = [{ range: 400, clock: 12, bearing: 2 }, { range: 560, clock: 1, bearing: 28 }, { range: 760, clock: 11, bearing: -29 }];
const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");

export async function startShow({ tl, panel, demo, ready = () => {} }) {
  const ac = tl.ac, AUDIO = "demo/audio/scene2/";
  const man = await fetch(AUDIO + "manifest.json" + V_).then(r => r.json());
  const sub = document.createElement("div");
  sub.style.cssText = "position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:118;max-width:min(760px,90vw);background:rgba(10,12,14,.82);color:#fff;padding:10px 18px;border-radius:8px;font:18px/1.4 system-ui;text-align:center;display:none";
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:118;background:rgba(10,12,14,.82);color:#f2c94c;padding:8px 16px;border-radius:8px;font:600 17px system-ui;display:none;text-align:center";
  const card = document.createElement("div");   // the range card in the corner while shooting
  card.style.cssText = "position:fixed;right:12px;top:56px;z-index:112;background:#f4f1e8;color:#1d2a40;border-radius:6px;padding:8px 12px;font:13px/1.5 system-ui;box-shadow:0 6px 24px rgba(0,0,0,.5);display:none";
  const skip = document.createElement("button"); skip.textContent = "Zakończ lekcję";
  skip.style.cssText = "position:fixed;right:16px;bottom:150px;z-index:119;background:rgba(12,14,16,.85);color:#eee;border:1px solid #555;border-radius:5px;padding:6px 12px;font:14px system-ui;cursor:pointer";
  sub.className = "simSub"; box.className = "simNote"; skip.className = "simSkip";
  document.body.append(sub, box, card, skip);
  let stopped = false, src = null; skip.onclick = () => { stopped = true; if (src) try { src.stop(); } catch (e) { } };
  const bufs = {};
  const say = async id => {
    if (stopped) return; const m = man[id]; if (!m) return;
    sub.textContent = m.text; sub.style.display = "block";
    try { bufs[id] ??= await fetch(AUDIO + m.file + V_).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b));
      ac.resume(); src = ac.createBufferSource(); src.buffer = bufs[id]; src.connect(tl.out);
      await new Promise(r => { src.onended = r; src.start(); }); } catch (e) { await new Promise(r => setTimeout(r, m.duration * 1000)); }
    await new Promise(r => setTimeout(r, 300));
  };
  const note = t => { box.innerHTML = t || ""; box.style.display = t ? "block" : "none"; };
  const wait = ms => stopped ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  const cFor = t => ({ ...BASE, ...TARGETS[t], target: t });
  const mil = t => 1000 / TARGETS[t].range, own = t => Math.round(1000 / (Math.round(mil(t) * 10) / 10));

  panel.setLocked(true); panel.setSubs(false); const voice0 = tl.voice; tl.voice = false;
  try {
    await demo.setConditions(cFor(0)); demo.setTargets(TARGETS); await demo.activateTarget(0, cFor(0));
    demo.setQuiz(false);
    // 1. the three gongs from behind the shooter
    tl.holdAt("s11.dir", 0.3);
    { const THREE = window.__ctx.THREE, fp = demo.fp, ax = demo.GC.clone().sub(fp).setY(0).normalize(); demo.setCam({ p: fp.clone().addScaledVector(ax, -6).add(new THREE.Vector3(0, 3.2, 0)), t: fp.clone().addScaledVector(ax, 120), fov: 50 }); }
    await new Promise(r => setTimeout(r, 300)); ready(); await say("n1");
    // 2. finding them all, at the lowest power
    demo.setCam(null);
    for (let t = 0; t < 3 && !stopped; t++) { await demo.activateTarget(t, cFor(t)); tl.holdAt("s08.found", 0.15); note(`Cel nr ${t + 1}`); if (t === 0) await say("n2"); else await wait(2200); }
    // 3. measuring each from its height (1.0 m)
    for (let t = 0; t < 3 && !stopped; t++) { await demo.activateTarget(t, cFor(t)); tl.holdAt("s09.why", 0.5);
      note(`Cel nr ${t + 1}: wysokość 1,0 m → ${f1(mil(t))} mil · 1,0 × 1000 / ${f1(mil(t))} = ${own(t)} m`); if (t === 0) await say("n3"); else await wait(3200); }
    // 4. the wind
    note(""); demo.setKestrelInset({ ...BASE }); tl.holdAt("s10.reading", 0.6); await say("n4");
    // 5. the directions, by eye
    for (let t = 0; t < 3 && !stopped; t++) { await demo.activateTarget(t, cFor(t)); tl.holdAt("s11.dir", 0.3); note(`Cel nr ${t + 1}: godzina ${TARGETS[t].clock}`); if (t === 0) await say("n5"); else await wait(2600); }
    // 6. all three on the range card
    note(""); demo.setCardTargets([0, 1].map(i => ({ range: own(i), bearing: TARGETS[i].bearing, n: i + 1 }))); tl.holdAt("s12.dope", 0.95); await say("n6"); demo.setCardTargets([]);
    // 7. the shooting, target by target, the range card in the corner
    card.innerHTML = "<b>Karta ognia</b><br>" + TARGETS.map((x, i) => `${i + 1} · ${own(i)} m · godz. ${x.clock}`).join("<br>"); card.style.display = "block";
    for (let t = 0; t < 3 && !stopped; t++) {
      await demo.activateTarget(t, cFor(t)); const d = demo.cond; demo.setDial({ elev: d.elev, wind: d.wind });
      tl.holdAt("s15.trigger", 0.2);   // the rifle close up, no turret overlay of lesson 1
      note(`Cel nr ${t + 1}: ${own(t)} m · podniesienie ${f1(d.elev)} · wiatr ${f1(Math.abs(d.wind))} ${d.wind >= 0 ? "w lewo" : "w prawo"}`);
      await say(["n7", "n8", "n9"][t]); if (stopped) break;
      tl.holdAt("s15.trigger", 0.6); let hits = 0;
      for (let k = 0; k < 2 && !stopped; k++) { await wait(1200); const r = await demo.fireLive(k); if (r.hit) hits++; }
      note(`Cel nr ${t + 1}: ${hits === 2 ? "trafiony – dwa trafienia" : `nietrafiony – ${hits} z 2`}`); await wait(1800);
    }
    tl.holdAt("s16.group", 0.5); note("Cele: 400, 560 i 760 m – po dwa strzały"); await say("n10"); await wait(600);
  } finally {
    sub.remove(); box.remove(); card.remove(); skip.remove(); demo.setCam(null); demo.setKestrelInset(null); demo.setCardTargets([]);
    await demo.setConditions(VIEW_CONDITIONS, true);
    tl.voice = voice0; panel.setSubs(true); panel.setLocked(false); tl.holdAt(tl.beats[0].say, 0);
  }
}
