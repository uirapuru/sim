// Menu background (author, 22 XI): while the welcome screen is up, the scene behind it plays at sunset (low sun,
// orange clouds) in four shots (see "shots" below): Dziadek (the legendary instructor, a hidden character) strolling in
// front of the stand; a group of four runners with rifles held overhead jogging along the road on the left of the
// stand, seen from ~100 m; the same road seen from the stand; and a low camera by the road the group runs past.
// It owns the camera and the frame only while the welcome screen is shown; start() / stop() are called by index.html
// (stop before any lesson / training / exam starts, so their own hour and weather win).

const SHOT_S = 20;                       // one shot, seconds (the pass lasts until the group is by)
const SUNSET = { hour: 18.5, decl: 8 };  // the sun on the horizon in the west-north-west, behind the stand (scene1 uses decl 8: September)
const DAY = { hour: 10, decl: 8 };       // scene1's own light, given back on stop
// the gravel road north-west of the range (picked on the orthophoto from above, 22 XI): from the junction behind the
// stand to the far end of the range, 780 m; the traced line runs ~1.2 m right of the road's middle (ROAD_LEFT)
const ROAD = [[396.4, 1840.3], [495.2, 1786.4], [592.3, 1721.1], [699.4, 1657.5], [876.5, 1519.1], [905.7, 1500.3], [1039.9, 1399.3]], ROAD_LEFT = 1.2;
// the group: two by two, metres (lateral +left, along the run -back) and phase of the stride (fraction of the loop)
const GROUP = [[0.65, 0, 0.0], [-0.65, -0.5, 0.37], [0.55, -2.4, 0.62], [-0.7, -2.9, 0.15]];

// The jog from Meshy runs ~3 s and moves forward; this cuts the best repeating stretch out of it (the poses at both ends
// closest, two strides or more), takes the forward travel out of the hips (the runner jogs in place, the menu moves the
// whole figure along the road) and returns the loop with its stride speed in the hips' units.
// rest (optional): bone name -> its rest quaternion; then the arms, hands, neck and head keep the modelled pose (arms
// straight up, the rifle in both hands - bending them squeezes the rifle, which is skinned to both hands) and the hips
// and spine lean 40 % of what the AI motion has
const STILL = /(Shoulder|Arm|ForeArm|Hand|Neck|Head|Bone_)/, LEAN = /(Hips|Spine)\.quaternion$/;
export function jogLoop(THREE, clip, rest = null, minLoop = 1.1) {
  const fps = 60, n = Math.floor(clip.duration * fps);
  const quats = clip.tracks.filter(t => t.name.endsWith(".quaternion"));
  const hips = clip.tracks.find(t => /Hips\.position$/.test(t.name));
  const ip = new Map(clip.tracks.map(t => [t, t.createInterpolant()]));
  const at = (t, s) => Array.from(ip.get(t).evaluate(s));
  const Q = []; for (let i = 0; i <= n; i++) Q.push(quats.map(t => at(t, i / fps)));
  const dq = (a, b) => { let e = 0; for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k][0] * b[k][0] + a[k][1] * b[k][1] + a[k][2] * b[k][2] + a[k][3] * b[k][3]); e += 1 - Math.min(1, d); } return e; };
  let best = null;
  for (let i = Math.floor(n * 0.08); i < n * 0.5; i++) for (let j = i + Math.ceil(minLoop * fps); j <= n - 3; j++) {
    const e = dq(Q[i], Q[j]) + dq(Q[i + 3], Q[j + 3]) * 0.5;       // same pose and same motion at both ends
    if (!best || e < best.e) best = { i, j, e };
  }
  const t0 = best.i / fps, t1 = best.j / fps, P = t1 - t0, step = 1 / 30, times = [];
  for (let s = 0; s < P - 1e-6; s += step) times.push(s); times.push(P);
  const h0 = at(hips, t0), h1 = at(hips, t1), drift = [h1[0] - h0[0], h1[2] - h0[2]];
  const tracks = [], qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  for (const tr of clip.tracks) {
    if (tr.name.endsWith(".scale")) continue;
    const bone = tr.name.slice(0, tr.name.lastIndexOf("."));
    if (rest && tr.name.endsWith(".quaternion") && STILL.test(bone) && rest.has(bone)) continue;   // stays in the rest pose
    const sz = tr.getValueSize(), vals = new Float32Array(times.length * sz);
    times.forEach((s, k) => {
      const last = k === times.length - 1, v = at(tr, last ? t0 : t0 + s);       // the last key is the first: no seam
      if (tr === hips) { const f = last ? 0 : s / P; v[0] -= h0[0] + drift[0] * f; v[2] -= h0[2] + drift[1] * f; }   // in place, the sway kept
      if (rest && LEAN.test(tr.name) && rest.has(bone)) { qa.fromArray(rest.get(bone)); qb.fromArray(v); qa.slerp(qb, 0.4); qa.toArray(v); }
      vals.set(v, k * sz);
    });
    if (tr.name.endsWith(".quaternion")) {                          // one hemisphere, so slerp takes the short way
      for (let k = 1; k < times.length; k++) { let d = 0; for (let c = 0; c < 4; c++) d += vals[(k - 1) * 4 + c] * vals[k * 4 + c]; if (d < 0) for (let c = 0; c < 4; c++) vals[k * 4 + c] *= -1; }
      tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, times, vals));
    } else tracks.push(new THREE.VectorKeyframeTrack(tr.name, times, vals));
  }
  return { clip: new THREE.AnimationClip("Rn_JogLoop", P, tracks), t0, t1, err: +best.e.toFixed(4), drift, speed: Math.hypot(drift[0], drift[1]) / P };
}

export async function makeMenu(ctx) {
  const { THREE, scene, camera, renderer, hAt, meta, GLTFLoader, SkeletonUtils } = ctx;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const hi = window.__quality && window.__quality.mode === "hi", loader = new GLTFLoader(), v = "?v=" + window.SIM_V;
  const [dzG, rnG] = await Promise.all([loader.loadAsync((hi ? "models/dziadek.glb" : "models/dziadek_lo.glb") + v), loader.loadAsync((hi ? "models/runner.glb" : "models/runner_lo.glb") + v)]);
  const group = new THREE.Group(); group.name = "menu"; group.visible = false; scene.add(group);
  const mixers = [];
  const prep = o => { o.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; c.frustumCulled = false; } }); return o; };

  // ---------- the stand shot: from the field a few metres off the firing point, towards the stand ----------
  const fp = meta.positions.firing_point, sd = meta.standDeck, st = sd ? V(sd.x, sd.y + 1.5, sd.z) : V(...meta.positions.stand);
  const toStand = V(st.x - fp[0], 0, st.z - fp[2]); const dl = toStand.length(); toStand.normalize();
  const right = V(-toStand.z, 0, toStand.x);                                   // on the screen's right, looking at the stand
  const camA = V(fp[0], 0, fp[2]).addScaledVector(toStand, Math.min(8, dl * 0.3)); camA.y = hAt(camA.x, camA.z) + 1.3;
  // Dziadek strolls to and fro across the frame, ~8 m from the camera (author, 22 XI): a casual walk along the
  // stand's front at the clip's own stride speed (0.7 m/s, measured on the planted foot - stride_test.html, so the
  // feet do not slide), a few seconds at ease at each end facing the field, then back. Walk and idle are blended by
  // hand every frame (three's crossFade disables the faded-out action, and the walk stayed off after the first turn)
  const dz = prep(dzG.scene); group.add(dz);
  const dzMid = camA.clone().addScaledVector(toStand, 8).addScaledVector(right, 1.0), DZ_HALF = 3, DZ_V = 0.7, DZ_REST = 3;
  const dzMix = new THREE.AnimationMixer(dz); mixers.push(dzMix);
  const dzWalk = dzMix.clipAction(dzG.animations.find(c => c.name === "Dz_Walk_Casual")), dzIdle = dzMix.clipAction(dzG.animations.find(c => c.name === "Dz_Idle"));
  dzWalk.play(); dzIdle.play();
  const dzS = { x: -DZ_HALF, dir: 1, rest: 0, yaw: 0, w: 1 };
  const dzStep = dt => {
    if (dzS.rest > 0) { dzS.rest -= dt; if (dzS.rest <= 0) dzS.dir *= -1; }
    else { dzS.x += dzS.dir * DZ_V * dzS.w * dt;
      if (Math.abs(dzS.x) >= DZ_HALF) { dzS.x = Math.sign(dzS.x) * DZ_HALF; dzS.rest = DZ_REST; } }
    dzS.w += ((dzS.rest > 0 ? 0 : 1) - dzS.w) * Math.min(1, dt * 3);
    dzWalk.setEffectiveWeight(dzS.w); dzIdle.setEffectiveWeight(1 - dzS.w);
    const p = dzMid.clone().addScaledVector(right, dzS.x); dz.position.set(p.x, hAt(p.x, p.z), p.z);
    const want = dzS.rest > 0 ? Math.atan2(-toStand.x, -toStand.z) : Math.atan2(right.x * dzS.dir, right.z * dzS.dir);   // at the ends he faces the field
    let d = want - dzS.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); dzS.yaw += d * Math.min(1, dt * 3); dz.rotation.y = dzS.yaw;
  };
  dzS.yaw = Math.atan2(right.x, right.z); dzStep(0);

  // ---------- the runners on the road ----------
  const curve = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => V(x, 0, z)), false, "centripetal"), L = curve.getLength();
  const rest = new Map(); rnG.scene.traverse(o => { if (o.isBone) rest.set(o.name, o.quaternion.toArray()); });
  const loop = jogLoop(THREE, rnG.animations.find(c => c.name === "Rn_Jog"), rest);
  const runners = GROUP.map(([lat, back, ph]) => {
    const o = prep(SkeletonUtils.clone(rnG.scene)); group.add(o);
    const m = new THREE.AnimationMixer(o), a = m.clipAction(loop.clip); a.play(); a.time = ph * loop.clip.duration; mixers.push(m);
    return { o, lat, back, s: 0.96 + ((lat * 7 + back * 3) % 1 + 1) % 1 * 0.08 };
  });
  runners.forEach(r => r.o.scale.setScalar(r.s));
  // the stride in metres per second and the way the clip faces: measured on one runner in its rest place
  let speed = 2.8, face = 0;
  { const o = runners[0].o; o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.updateMatrixWorld(true);
    const hipsB = o.getObjectByName("mixamorigHips"), par = hipsB.parent, a = V(), b = V(loop.drift[0], 0, loop.drift[1]);
    par.localToWorld(a); par.localToWorld(b); const d = b.sub(a); d.y = 0;
    if (d.length() > 1e-4) { speed = d.length() / loop.clip.duration; face = Math.atan2(d.x, d.z); } }
  let s = 0;                                                                     // the group's way along the road, m
  const placeRunners = () => {
    const u = Math.min(s, L) / L, c = curve.getPointAt(u), t = curve.getTangentAt(u).setY(0).normalize(), lt = V(t.z, 0, -t.x);
    const over = Math.max(0, s - L);                                             // past the end: straight on
    c.addScaledVector(t, over);
    for (const r of runners) { const p = c.clone().addScaledVector(lt, r.lat + ROAD_LEFT).addScaledVector(t, r.back); r.o.position.set(p.x, hAt(p.x, p.z), p.z); r.o.rotation.y = Math.atan2(t.x, t.z) - face; }
    return { c: c.setY(hAt(c.x, c.z)), t, lt };
  };

  // ---------- light: sunset ----------
  const sky = scene.children.find(o => o.material && o.material.uniforms && o.material.uniforms.sunPosition);
  const SKY_KEYS = ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"], skySaved = {};
  const clouds = scene.getObjectByName("clouds"), cloudSaved = [];
  let fogSaved = null;
  function sunsetOn() {
    window.__sim.setHour(SUNSET.hour, SUNSET.decl);
    if (sky) { const U = sky.material.uniforms; for (const k of SKY_KEYS) skySaved[k] = U[k].value; U.turbidity.value = 14; U.rayleigh.value = 4; U.mieCoefficient.value = 0.015; U.mieDirectionalG.value = 0.93; }
    renderer.toneMappingExposure = 0.72;                                          // setHour opens it up for the low sun: an orange sky, not a white one
    const sun = sky ? sky.material.uniforms.sunPosition.value.clone().setY(0).normalize() : V(-1, 0, 0);
    if (clouds) clouds.children.forEach(c => { cloudSaved.push([c, c.material.color.getHex(), c.material.opacity]);
      const k = (V(c.position.x, 0, c.position.z).sub(camA).setY(0).normalize().dot(sun) + 1) / 2;   // 1 towards the sun
      c.material.color.setRGB(1.0, 0.45 + 0.25 * k, 0.32 + 0.05 * k); c.material.opacity = 0.95; });
    fogSaved = scene.fog.color.getHex(); scene.fog.color.setRGB(0.62, 0.42, 0.33);
  }
  function sunsetOff() {
    if (sky) { const U = sky.material.uniforms; for (const k of SKY_KEYS) if (k in skySaved) U[k].value = skySaved[k]; }
    for (const [c, col, op] of cloudSaved) { c.material.color.setHex(col); c.material.opacity = op; } cloudSaved.length = 0;
    window.__sim.setHour(DAY.hour, DAY.decl);                                     // also gives back the fog colour
  }

  // a bank of sunset clouds low over the horizon on the sun's side (the lesson's own clouds are high and few), gold
  // near the sun, pink and violet away from it; and a weak warm light from the east, so the faces against the sun are
  // not black
  { const sun = sky ? sky.material.uniforms.sunPosition.value : V(-1, 0, 0);
    window.__sim.setHour(SUNSET.hour, SUNSET.decl); const az0 = Math.atan2(sun.x, sun.z); window.__sim.setHour(DAY.hour, DAY.decl);
    let r_ = 4242; const rnd = () => (r_ = (r_ * 16807) % 2147483647) / 2147483647;
    const tex = seed => { const c = document.createElement("canvas"); c.width = 512; c.height = 160; const x = c.getContext("2d"); r_ = seed;
      for (let i = 0; i < 26; i++) { const cx = 60 + rnd() * 392, cy = 70 + (rnd() - 0.5) * 50, rr = 25 + rnd() * 55, g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rr * 1.6, rr * 0.55, 0, 0, 7); x.fill(); }
      const t_ = new THREE.CanvasTexture(c); t_.colorSpace = THREE.SRGBColorSpace; return t_; };
    for (let i = 0; i < 16; i++) {
      const a = az0 + (rnd() - 0.5) * 2.6, d = 1800 + rnd() * 2600, k = Math.max(0, Math.cos(a - az0));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(777 + i * 31), transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
      sp.material.color.setRGB(1.0, 0.38 + 0.32 * k * k, 0.42 - 0.18 * k);
      const w = 700 + rnd() * 1300; sp.scale.set(w, w * 0.22, 1); sp.position.set(st.x + Math.sin(a) * d, 180 + rnd() * 420 + d * 0.04, st.z + Math.cos(a) * d); group.add(sp); }
    const fill = new THREE.DirectionalLight(0xffc6a0, 0.9); fill.position.set(st.x - Math.sin(az0) * 100, st.y + 40, st.z - Math.cos(az0) * 100); fill.target.position.copy(st); group.add(fill, fill.target); }

  // ---------- shots (author, 22 XI) ----------
  // 1 stand - Dziadek in front of the stand, 20 s
  // 2 road  - the group ~100 m off, from the side, from ahead or from behind in turn, 20 s
  // 3 from the stand - from the road's start by the stand, along the road to the group, a long lens, 20 s
  // 4 pass  - a camera low on the ground by the road PASS_S m from the stand; the group comes at it from 50 m away and
  //           runs past, then back to 1
  const SHOTS = ["stand", "road", "fromStand", "pass"], PASS_S = 150, PASS_FROM = 50;
  let on = false, idx = -1, shotT = 0, roadShot = 0, roadCam = null;
  const cam = { p: V(), look: V(), fov: 45 };
  const kind = () => SHOTS[idx];
  const roadAt = (sx, lat = 0) => { const u = THREE.MathUtils.clamp(sx / L, 0, 1), c = curve.getPointAt(u), tg = curve.getTangentAt(u).setY(0).normalize(), lt = V(tg.z, 0, -tg.x);
    return c.addScaledVector(lt, ROAD_LEFT + lat).setY(0); };
  function next() {
    idx = (idx + 1) % SHOTS.length; shotT = 0;
    if (kind() === "stand") { if (s > L) s = 0; return; }                        // the group starts again unseen
    if (kind() === "pass") { s = PASS_S - PASS_FROM;                              // the group put 50 m before the camera (a cut)
      const c = roadAt(PASS_S, -2.4), ahead = roadAt(PASS_S - 10); roadCam = { p: c.setY(hAt(c.x, c.z) + 0.3), ahead: ahead.setY(hAt(ahead.x, ahead.z) + 1.4) }; return; }
    if (kind() === "fromStand") { const c = roadAt(0, -3); roadCam = { p: c.setY(hAt(c.x, c.z) + 4.5) }; return; }
    roadShot++;
    const g = placeRunners(), k = ["side", "ahead", "behind"][roadShot % 3];
    if (k === "ahead") { const p = g.c.clone().addScaledVector(g.t, 155).addScaledVector(g.lt, -3.5); roadCam = { kind: k, p: p.setY(hAt(p.x, p.z) + 1.6) }; }
    else roadCam = { kind: k };
  }
  const shotOver = () => kind() === "pass" ? s > PASS_S + 7 : shotT >= SHOT_S;
  function shotCamera() {
    const k = Math.min(1, shotT / SHOT_S);
    if (kind() === "stand") {                                                     // a slow push towards the stand
      cam.p.copy(camA).addScaledVector(toStand, 1.0 * k); cam.look.set(st.x, st.y - 2.5, st.z).addScaledVector(right, 7); cam.fov = 50; return;
    }
    const g = placeRunners(), mid = g.c.clone().addScaledVector(g.t, -1.4).add(V(0, 1.2, 0));
    if (kind() === "fromStand") {                                                 // the group ~10 m tall in the frame, however far
      const d = roadCam.p.distanceTo(mid); cam.p.copy(roadCam.p); cam.look.copy(mid); cam.fov = THREE.MathUtils.clamp(2 * Math.atan(5 / d) * 180 / Math.PI, 2.5, 45); return;
    }
    if (kind() === "pass") {                                                      // low and wide; follows them as they pass
      cam.p.copy(roadCam.p); cam.fov = 55;
      const f = THREE.MathUtils.clamp((s - (PASS_S - 12)) / 18, 0, 1);            // from the road ahead to the group beside and past
      cam.look.copy(roadCam.ahead).lerp(mid, 0.35 + 0.65 * f); return;
    }
    if (roadCam.kind === "side") { cam.p.copy(mid).addScaledVector(g.lt, -108.5 + 2 * k).addScaledVector(g.t, 4 - 7 * k).add(V(0, 1.5, 0)); cam.look.copy(mid); cam.fov = 40; }
    else if (roadCam.kind === "ahead") { cam.p.copy(roadCam.p); cam.look.copy(mid); cam.fov = 40; }
    else { cam.p.copy(mid).addScaledVector(g.t, -107).addScaledVector(g.lt, 2.2).add(V(0, 1.8, 0)); cam.look.copy(mid).addScaledVector(g.t, 6); cam.fov = 45; }
    const gy = hAt(cam.p.x, cam.p.z) + 0.4; if (cam.p.y < gy) cam.p.y = gy;
  }

  // hide what the lesson keeps on the stage (soldier, instructor, rifle, props) while the menu draws
  const mine = new Set([group]);
  const stash = [];
  function hideStage() {
    const d = window.__demo || {}, list = [d.man && d.man.m, d.inst && d.inst.m, d.rifle, d.kestrel, ...(d.handsMan ? [d.handsMan.group, d.handsMan.root] : []), ...(d.handsInst ? [d.handsInst.group, d.handsInst.root] : [])];
    for (const o of scene.children) { if (mine.has(o) || !o.visible) continue; let sk = false; o.traverse(c => { if (c.isSkinnedMesh) sk = true; }); if (sk) list.push(o); }
    for (const o of list) if (o && o.visible && !mine.has(o)) { o.visible = false; stash.push(o); }
  }
  const showStage = () => { for (const o of stash) o.visible = true; stash.length = 0; };

  const hook = dt => {
    if (!on) return;
    shotT += dt; s += speed * dt;
    if (idx < 0 || shotOver()) next();
    placeRunners();
    dzStep(dt); for (const m of mixers) m.update(dt);
    shotCamera();
    camera.position.copy(cam.p); camera.up.set(0, 1, 0); camera.lookAt(cam.look); camera.fov = cam.fov; camera.updateProjectionMatrix();
  };
  (window.__frameHooks = window.__frameHooks || []).push(hook);
  const prevRender = window.__renderOverride, prevState = window.__demoState;
  window.__renderOverride = () => { if (!on) return prevRender ? prevRender() : renderer.render(scene, camera); hideStage(); renderer.render(scene, camera); showStage(); };
  window.__demoState = () => on ? "busy" : prevState ? prevState() : "idle";

  const api = {
    start() { if (on) return; on = true; idx = -1; shotT = 0; group.visible = true; sunsetOn(); document.getElementById("welcome")?.classList.add("live"); document.documentElement.classList.add("menuLive"); if (window.__redraw) window.__redraw.kick(1000); },
    stop() { if (!on) return; on = false; group.visible = false; sunsetOff(); document.getElementById("welcome")?.classList.remove("live"); document.documentElement.classList.remove("menuLive"); if (window.__redraw) window.__redraw.kick(1000); },
    get on() { return on; }, get shot() { return kind(); }, loop, speed, L,
    goShot(i, road) { idx = (i + SHOTS.length - 1) % SHOTS.length; next(); if (road != null) s = road; },   // test hook: shot i (0..3), the group at road m
    get road() { return s; },
  };
  return api;
}
