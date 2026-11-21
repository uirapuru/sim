// Scenario 3, demonstration (author, 21 XI 2026; docs/superpowers/specs/2026-11-21-scenario3-sniper-team-design.md):
// the sniper pair in the forest, the instructor on the stand's deck. The narrator explains, the spotter and the shooter
// speak the fire dialogue (sniperTAK, the author's wording of 21 XI: target confirmed, settings in milsa); the first
// shot hits, the target falls, "Cel zlikwidowany", and the pair withdraws crawling, then on foot. Fixed conditions, so the dialogue has fixed numbers (the recorded voices).
const V_ = new URL(import.meta.url).search;
const { VIEW_CONDITIONS } = await import("./training/conditions.js" + V_);
const COND = { wind: 3, windFrom: 9, hour: 11, weather: "clear", temp: 15, pressure: 1010 };
const WHO = { narrator: "", spotter: "Obserwator", shooter: "Strzelec" };

export async function startShow({ tl, panel, demo, ready = () => {} }) {
  const ac = tl.ac, AUDIO = "demo/audio/scene3/";
  const man = await fetch(AUDIO + "manifest.json" + V_).then(r => r.json());
  const sub = document.createElement("div");
  sub.style.cssText = "position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:118;max-width:min(760px,90vw);background:rgba(10,12,14,.82);color:#fff;padding:10px 18px;border-radius:8px;font:18px/1.4 system-ui;text-align:center;display:none";
  const box = document.createElement("div");   // measurement and notes
  box.style.cssText = "position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:118;background:rgba(10,12,14,.82);color:#f2c94c;padding:8px 16px;border-radius:8px;font:600 17px system-ui;display:none";
  const skip = document.createElement("button"); skip.textContent = "Zakończ pokaz";
  skip.style.cssText = "position:fixed;right:16px;bottom:150px;z-index:119;background:rgba(12,14,16,.85);color:#eee;border:1px solid #555;border-radius:5px;padding:6px 12px;font:14px system-ui;cursor:pointer";
  sub.className = "simSub"; box.className = "simNote"; skip.className = "simSkip";
  document.body.append(sub, box, skip);
  let stopped = false, src = null; skip.onclick = () => { stopped = true; if (src) try { src.stop(); } catch (e) { } };
  const bufs = {};
  const say = async id => {
    if (stopped) return; const m = man[id]; if (!m) return;
    sub.innerHTML = (WHO[m.who] ? `<b style="color:${m.who === "spotter" ? "#9fd3ff" : "#f2c94c"}">${WHO[m.who]}:</b> ` : "") + m.text; sub.style.display = "block";
    try { bufs[id] ??= await fetch(AUDIO + m.file + V_).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b));
      ac.resume(); src = ac.createBufferSource(); src.buffer = bufs[id]; src.connect(tl.out);
      await new Promise(r => { src.onended = r; src.start(); }); } catch (e) { await new Promise(r => setTimeout(r, m.duration * 1000)); }
    await new Promise(r => setTimeout(r, 300));
  };
  const note = t => { box.textContent = t || ""; box.style.display = t ? "block" : "none"; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // a fresh stop of the instructor (he stands 6 s): the measurement and the shot happen then
  const waitStop = async () => { while (!stopped && demo.deckWalk().stop) await wait(100); while (!stopped && !demo.deckWalk().stop) await wait(100); };

  panel.setLocked(true); panel.setSubs(false); const voice0 = tl.voice; tl.voice = false;
  try {
    await demo.setSite(3, COND, -2); demo.setDial({ elev: 6.0, wind: 0.8 });   // the first place: a metre right of the good one
    const s3 = demo.site3, fp = demo.fp, toPair = fp.clone().sub(s3.aim).setY(0).normalize(), along = { x: -toPair.z, z: toPair.x };
    const deckCam = { p: s3.aim.clone().addScaledVector(toPair, 16).add({ x: along.x * 6, y: 2.5, z: along.z * 6 }), t: s3.aim.clone(), fov: 42 };
    const dirOut = toPair.clone().negate(), side = { x: dirOut.z, z: -dirOut.x };
    let pairCam = { p: fp.clone().add({ x: side.x * 3.2 - dirOut.x * 2.2, y: 1.4, z: side.z * 3.2 - dirOut.z * 2.2 }), t: fp.clone().add({ x: side.x * 0.6, y: 0.25, z: side.z * 0.6 }), fov: 48 };
    const behindCam = { p: fp.clone().add({ x: -dirOut.x * 4.5 + side.x * 0.6, y: 1.5, z: -dirOut.z * 4.5 + side.z * 0.6 }), t: fp.clone().addScaledVector(dirOut, 30).setY(fp.y + 1.0), fov: 55 };
    tl.holdAt("s14.cmd", 0.5);
    demo.setCam(deckCam); await new Promise(r => setTimeout(r, 300)); ready(); await say("n1");
    demo.setCam(behindCam); await say("n2");
    // the forest as seen from the stand: the pair stays hidden (author, 21 XI)
    { const toP = fp.clone().sub(s3.B).setY(0).normalize(); demo.setCam({ p: s3.B.clone().addScaledVector(toP, 0.7).setY(s3.deckY + 1.7), t: fp.clone().setY(fp.y + 0.4), fov: 6 }); await say("n2b"); }
    // the place (author, 21 XI): the first one half hides the stand, the next has a twig in front of the muzzle,
    // the third gives a view good enough and a clear way for the bullet - half a metre at a time to the left
    demo.setCam(null); demo.setScopeEye("shooter"); tl.holdAt("s15.trigger", 0.6); note("Miejsce 1: luneta strzelca"); await say("n2c");
    await demo.setSite(3, COND, -1); tl.holdAt("s15.trigger", 0.6); note("Miejsce 2: luneta strzelca"); await say("n2d");
    tl.holdAt("s14.cmd", 0.5); demo.setCam(demo.barrelCam()); demo.showBoreLine(true); note("Miejsce 2: wzdłuż lufy – tor pocisku (żółty) kończy się w gałązce"); await say("n2e");
    demo.showBoreLine(false); demo.setCam(null);
    await demo.setSite(3, COND, 0); tl.holdAt("s15.trigger", 0.6); note("Miejsce 3: luneta strzelca"); await say("n2f");
    tl.holdAt("s14.cmd", 0.5); demo.setCam(demo.barrelCam()); demo.showBoreLine(true); note("Miejsce 3: wzdłuż lufy – tor wolny"); await wait(2500);
    demo.showBoreLine(false); demo.setCam(null);
    pairCam = { p: fp.clone().add({ x: side.x * 3.2 - dirOut.x * 2.2, y: 1.4, z: side.z * 3.2 - dirOut.z * 2.2 }), t: fp.clone().add({ x: side.x * 0.6, y: 0.25, z: side.z * 0.6 }), fov: 48 };
    // the observer's reading: his spotting scope at 12x on the instructor when he stands
    demo.setScopeEye("observer"); tl.holdAt("s09.why", 0.5); note("Czekamy, aż instruktor stanie…"); await waitStop();
    note("Wysokość 1,80 m → 3,0 mil · 1,8 × 1000 / 3,0 = 600 m"); await say("n3"); demo.setScopeEye("shooter");
    note(""); demo.setKestrelInset({ ...COND, wind: COND.wind }); tl.holdAt("s14.cmd", 0.5); demo.setCam(pairCam); await say("n4");
    for (const id of ["d1", "d2", "d5", "d6", "d7", "d8", "d9", "d10"]) await say(id);
    demo.setDial({ elev: 6.0, wind: 1.3 });   // as called: 6,0 milsa up, 1,3 milsa left (wind from 9)
    // the shot: on the spotter's command, when the instructor stands; the first one hits
    demo.setCam(null); tl.holdAt("s15.trigger", 0.6); note("Strzelec czeka na komendę"); await waitStop(); note("");
    await say("d11"); await say("d12"); if (stopped) return;
    const r1 = await demo.fireLive(0); await wait(400);
    if (r1.hit) await say("d16"); else note("Pudło – w treningu obserwator poda poprawkę");
    // nothing stays behind: the case and the kit go with them (author, 21 XI)
    tl.holdAt("s14.cmd", 0.5); demo.setKestrelInset(null); demo.setCam(pairCam); note("Łuska, sprzęt, notatki – nic nie zostaje");
    await say("d17"); await say("d18"); await say("n5"); note("");
    // the withdrawal: crawling back into the forest, then on foot, gone among the trees (author, 21 XI)
    demo.setCam(null); tl.holdAt("s14.cmd", 0.5); demo.setKestrelInset(null);
    const back = fp.clone().sub(s3.aim).setY(0).normalize(), sideW = { x: -back.z, z: back.x };
    // down the open lane of the withdrawal: they crawl towards the camera
    demo.setCam({ p: fp.clone().add({ x: sideW.x * 1.2 + back.x * 9, y: 2.4, z: sideW.z * 1.2 + back.z * 9 }), t: fp.clone().add({ x: back.x * 3, y: 0.1, z: back.z * 3 }), fov: 45 });
    demo.setWithdraw("crawl"); await say("n6"); await wait(2500);
    const base = fp.clone().addScaledVector(back, 50);
    demo.setWithdraw("walk");
    demo.setCam({ p: base.clone().add({ x: sideW.x * 6 - back.x * 3, y: 1.7, z: sideW.z * 6 - back.z * 3 }), t: base.clone().addScaledVector(back, 10).setY(base.y + 1.2), fov: 50 });
    await say("n7"); await wait(5000);
    demo.setWithdraw(null);
  } finally {
    sub.remove(); box.remove(); skip.remove(); demo.setCam(null); demo.setKestrelInset(null); demo.setWithdraw(null); demo.showBoreLine(false); demo.setScopeEye("shooter");
    await demo.setSite(1, VIEW_CONDITIONS); await demo.setConditions(VIEW_CONDITIONS, true);
    tl.voice = voice0; panel.setSubs(true); panel.setLocked(false); tl.holdAt(tl.beats[0].say, 0);
  }
}
