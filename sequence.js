// Scripted scene: third-person camera behind the shooter; he walks to the firing point, goes prone
// behind the Spotter 60, looks at a steel target through the spotter (black eyepiece view with a
// mil-dot reticle), slides over to the rifle and fires. Impact and the steel "ding" arrive after the
// bullet's time of flight and the sound's return trip.

const TARGET_RANGE = 300;          // m
const BULLET_TOF = 0.42;           // s, .308 175 gr at 300 m (approx.)
const SOUND = 343;                 // m/s
const SPOTTER_FOV_DEG = 1.2;       // vertical true field of view at ~40x

let running = false;

export async function play(ctx) {
  if (running) return;
  running = true;
  const { THREE, scene, camera, renderer, hAt, meta, FIRE, gltf, clips, SkeletonUtils, GLTFLoader, mixers } = ctx;
  const hooks = (window.__frameHooks = window.__frameHooks || []);
  const clock = { t: 0 };
  const wait = s => new Promise(r => { const end = clock.t + s; const h = () => { if (clock.t >= end) { hooks.splice(hooks.indexOf(h), 1); r(); } }; hooks.push(h); });
  hooks.push(dt => { clock.t += dt; });

  scene.traverse(o => { if (o.userData.distanceMarker) o.visible = false; });   // spike-only markers would block the line of sight
  const fwd = new THREE.Vector3(FIRE.x, 0, FIRE.y).normalize();          // towards the target
  const left = new THREE.Vector3(fwd.z, 0, -fwd.x);                        // shooter's left
  const fp = new THREE.Vector3(meta.positions.firing_point[0], 0, meta.positions.firing_point[2]);
  const ground = p => { p.y = hAt(p.x, p.z); return p; };
  const yawTo = d => Math.atan2(d.x, d.z);                                 // glTF front (+Z) -> d

  // ---- props: rifle on bipod at the firing point, spotter 0.9 m to the left ----
  const rifle = makeRifle(THREE);
  const rifleBase = ground(fp.clone());
  rifle.position.copy(rifleBase); rifle.rotation.y = yawTo(fwd); scene.add(rifle);
  const spotter = (await new GLTFLoader().loadAsync("models/spotter60_prone.glb")).scene;
  spotter.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const spotPos = ground(fp.clone().addScaledVector(left, 0.9).addScaledVector(fwd, 0.15));
  spotter.position.copy(spotPos); spotter.rotation.y = yawTo(fwd) + Math.PI; scene.add(spotter);   // Blender +Y (target) = glTF -Z

  // ---- steel target: 0.5 x 0.5 m plate on a post, swings when hit ----
  const tPos = ground(fp.clone().addScaledVector(fwd, TARGET_RANGE));
  const target = new THREE.Group(); target.position.copy(tPos); target.rotation.y = yawTo(fwd) + Math.PI; scene.add(target);
  const steel = new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.55, metalness: 0.4 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), new THREE.MeshLambertMaterial({ color: 0x4a4038 }));
  post.position.y = 0.65; target.add(post);
  const pivot = new THREE.Group(); pivot.position.y = 1.3; target.add(pivot);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.015), steel); plate.position.y = -0.32; plate.castShadow = true; pivot.add(plate);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), steel); chain.position.y = -0.04; pivot.add(chain);
  let swing = 0, swingV = 0;
  hooks.push(dt => { swingV += (-30 * swing - 1.2 * swingV) * dt; swing += swingV * dt; pivot.rotation.x = swing; });

  // ---- shooter ----
  const man = SkeletonUtils.clone(gltf.scene); scene.add(man);
  man.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const mixer = new THREE.AnimationMixer(man); mixers.push(mixer);
  let cur = null;
  const playClip = (name, fade = 0.4, opts = {}) => {
    const a = mixer.clipAction(clips[name]); a.reset();
    a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = !!opts.once;
    a.timeScale = opts.speed ?? 1; if (opts.at != null) a.time = opts.at;
    a.play(); if (cur && cur !== a) cur.crossFadeTo(a, fade, false); cur = a; return a;
  };
  const start = ground(fp.clone().addScaledVector(fwd, -18).addScaledVector(left, 0.9));
  const lieAtSpotter = ground(spotPos.clone().addScaledVector(fwd, -1.35).addScaledVector(left, 0.05));    // eyes at the spotter eyepiece
  const lieAtRifle = ground(rifleBase.clone().addScaledVector(fwd, -1.25).addScaledVector(left, 0.22));   // stock at the right shoulder
  man.position.copy(start); man.rotation.y = yawTo(fwd);

  // ---- third-person camera: behind and above the shooter, smoothed ----
  window.__camOverride = true;
  const camOff = { back: 3.2, up: 1.7, look: 1.2 };
  const camPos = man.position.clone().addScaledVector(fwd, -camOff.back).add(new THREE.Vector3(0, camOff.up, 0));
  camera.fov = 55; camera.updateProjectionMatrix();
  const camHook = dt => {
    const want = man.position.clone().addScaledVector(fwd, -camOff.back).addScaledVector(left, -0.6);
    want.y = man.position.y + camOff.up;
    camPos.lerp(want, 1 - Math.exp(-dt * 3));
    camera.position.copy(camPos);
    camera.lookAt(man.position.clone().addScaledVector(fwd, 6).add(new THREE.Vector3(0, camOff.look * 0.6, 0)));
  };
  hooks.push(camHook);

  // ---- audio ----
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const shot = () => noiseBurst(ac, 0.45, 2200, 0.9);
  const ding = () => bell(ac, [1830, 2740, 4120], 1.6, 0.35);

  // ================= timeline =================
  hud("Strzelec podchodzi do stanowiska");
  playClip("Casual_Walk", 0.2);
  const walkDist = start.distanceTo(lieAtSpotter) - 1.2, speed = 1.35;
  await move(man, start, start.clone().lerp(lieAtSpotter, walkDist / start.distanceTo(lieAtSpotter)), walkDist / speed);

  hud("Kładzie się za lunetą obserwacyjną");
  playClip("Squat_Stance", 0.5); await wait(0.9);
  camOff.back = 2.6; camOff.up = 1.15; camOff.look = 0.4;
  playClip("Prone_Fire", 1.1, { at: 0.5, speed: 0.0 });
  await move(man, man.position.clone(), lieAtSpotter, 1.3);
  await wait(1.0);

  hud("Obserwacja celu przez Spotter 60 (siatka Mil-Dot)");
  const eye = spotPos.clone().addScaledVector(fwd, -0.24); eye.y = spotPos.y + 0.345;
  await scopeView(ctx, eye, tPos.clone().add(new THREE.Vector3(0, 0.98, 0)), 4.0);

  hud("Przesuwa się do karabinu");
  playClip("Low_Crawl", 0.5, { speed: 1.0 });
  await move(man, man.position.clone(), lieAtRifle, 2.2);
  playClip("Prone_Fire", 0.6, { at: 0.5, speed: 0.0 });
  await wait(1.5);

  hud("Strzał");
  shot();
  recoil(man, rifle, fwd, hooks);
  muzzle(scene, THREE, rifle, fwd, hooks);
  dust(scene, THREE, rifleBase.clone().addScaledVector(fwd, 0.9), hooks);
  await wait(BULLET_TOF);
  swingV = -6;                                                                     // plate kicked back
  setTimeout(ding, (TARGET_RANGE / SOUND) * 1000);                                 // sound returns ~0.9 s later
  hud(`Trafienie: lot pocisku ${BULLET_TOF.toFixed(2)} s, dźwięk gongu po ${(BULLET_TOF + TARGET_RANGE / SOUND).toFixed(1)} s`);
  await scopeView(ctx, eye, tPos.clone().add(new THREE.Vector3(0, 0.98, 0)), 2.6);
  await wait(1.5);
  hud("");
  window.__camOverride = false;
  hooks.splice(hooks.indexOf(camHook), 1);
  window.__seqMan = man; window.__seqEye = eye; window.__seqTarget = tPos;
  running = false;

  // ---------- helpers bound to this run ----------
  function move(obj, a, b, secs) {
    return new Promise(res => {
      let t = 0; const from = a.clone(), to = b.clone();
      const h = dt => { t = Math.min(1, t + dt / secs); const p = from.clone().lerp(to, t); obj.position.set(p.x, hAt(p.x, p.z), p.z);
        if (t >= 1) { hooks.splice(hooks.indexOf(h), 1); res(); } };
      hooks.push(h);
    });
  }
  function scopeView(ctx, eyePos, look, secs) {
    const cam = new THREE.PerspectiveCamera(SPOTTER_FOV_DEG, innerWidth / innerHeight, 0.5, 5000);
    cam.position.copy(eyePos); cam.lookAt(look);
    const ov = reticleOverlay(SPOTTER_FOV_DEG);
    window.__renderOverride = () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.render(scene, cam); };
    return wait(secs).then(() => { window.__renderOverride = null; ov.remove(); });
  }
}

// ---------- visuals ----------
function makeRifle(THREE) {
  const g = new THREE.Group(), tan = new THREE.MeshLambertMaterial({ color: 0x8a7a5a }), blk = new THREE.MeshLambertMaterial({ color: 0x1c1d1f });
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  const cyl = (r, l, x, y, z, m) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), m); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); c.castShadow = true; g.add(c); return c; };
  box(0.07, 0.13, 0.42, 0, 0.21, -0.55, tan);            // stock
  box(0.06, 0.08, 0.5, 0, 0.24, -0.1, tan);              // chassis / forend
  cyl(0.011, 0.66, 0, 0.27, 0.45, blk);                  // barrel
  cyl(0.02, 0.17, 0, 0.27, 0.84, blk);                   // suppressor-like brake
  cyl(0.02, 0.36, 0, 0.34, -0.12, blk);                  // scope tube
  cyl(0.028, 0.08, 0, 0.34, 0.08, blk);                  // objective bell
  cyl(0.024, 0.06, 0, 0.34, -0.31, blk);                 // eyepiece
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 16), blk); turret.position.set(0, 0.37, -0.12); g.add(turret);
  for (const s of [-1, 1]) { const leg = box(0.015, 0.24, 0.015, s * 0.05, 0.11, 0.18, blk); leg.rotation.z = s * 0.25; }   // bipod
  g.userData.muzzle = new THREE.Vector3(0, 0.27, 0.93);
  return g;
}
function recoil(man, rifle, fwd, hooks) {
  let t = 0; const r0 = rifle.position.clone(), m0 = man.position.clone();
  const h = dt => { t += dt; const k = Math.exp(-t * 9) * Math.sin(Math.min(t * 40, Math.PI)) * 0.05;
    rifle.position.copy(r0).addScaledVector(fwd, -k); man.position.copy(m0).addScaledVector(fwd, -k * 0.6);
    if (t > 0.6) { rifle.position.copy(r0); man.position.copy(m0); hooks.splice(hooks.indexOf(h), 1); } };
  hooks.push(h);
}
function muzzle(scene, THREE, rifle, fwd, hooks) {
  const p = rifle.localToWorld(rifle.userData.muzzle.clone());
  const light = new THREE.PointLight(0xffb060, 30, 6); light.position.copy(p); scene.add(light);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.9 }));
  flash.position.copy(p); scene.add(flash);
  let t = 0; const h = dt => { t += dt; flash.scale.setScalar(1 + t * 20); flash.material.opacity = Math.max(0, 0.9 - t * 12); light.intensity = Math.max(0, 30 - t * 600);
    if (t > 0.12) { scene.remove(flash, light); hooks.splice(hooks.indexOf(h), 1); } };
  hooks.push(h);
}
function dust(scene, THREE, at, hooks) {
  const n = 60, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { pos.set([at.x, at.y + 0.05, at.z], i * 3); vel.push(new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 0.9, (Math.random() - 0.5) * 2.4)); }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xb8a888, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  let t = 0; const h = dt => { t += dt; for (let i = 0; i < n; i++) { pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt; vel[i].multiplyScalar(1 - dt * 1.5); }
    geo.attributes.position.needsUpdate = true; mat.opacity = Math.max(0, 0.6 - t * 0.3);
    if (t > 2) { scene.remove(pts); hooks.splice(hooks.indexOf(h), 1); } };
  hooks.push(h);
}
// black screen with a round eyepiece and an FFP mil-dot reticle (1 mil = 1 m at 1000 m)
function reticleOverlay(fovDeg) {
  const H = innerHeight, W = innerWidth, R = Math.min(W, H) * 0.44;
  const pxPerMil = (H / 2) / Math.tan(fovDeg * Math.PI / 360) * 0.001;
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;inset:0;z-index:50;pointer-events:none;background:radial-gradient(circle at 50% 50%, transparent ${R - 6}px, rgba(0,0,0,.85) ${R}px, #000 ${R + 2}px)`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", W); svg.setAttribute("height", H); svg.style.cssText = "position:absolute;inset:0";
  const cx = W / 2, cy = H / 2, line = (x1, y1, x2, y2, w) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="${w}"/>`;
  let s = line(cx - R, cy, cx + R, cy, 1.4) + line(cx, cy - R, cx, cy + R, 1.4);
  for (let k = -10; k <= 10; k++) { if (!k) continue; const d = k * pxPerMil; if (Math.abs(d) > R - 10) continue;
    s += `<ellipse cx="${cx + d}" cy="${cy}" rx="${pxPerMil * 0.12}" ry="${pxPerMil * 0.12}" fill="#111"/><ellipse cx="${cx}" cy="${cy + d}" rx="${pxPerMil * 0.12}" ry="${pxPerMil * 0.12}" fill="#111"/>`; }
  svg.innerHTML = s; div.appendChild(svg);
  const cap = document.createElement("div"); cap.textContent = "Spotter 60 · 40× · siatka Mil-Dot (FFP)";
  cap.style.cssText = "position:absolute;bottom:18px;width:100%;text-align:center;color:#bbb;font:13px monospace"; div.appendChild(cap);
  document.body.appendChild(div);
  return div;
}
function hud(text) {
  let el = document.getElementById("seqhud");
  if (!el) { el = document.createElement("div"); el.id = "seqhud"; el.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:60;background:rgba(0,0,0,.6);color:#fff;padding:6px 14px;border-radius:6px;font:15px system-ui"; document.body.appendChild(el); }
  el.textContent = text; el.style.display = text ? "block" : "none";
}
// ---------- audio ----------
function noiseBurst(ac, dur, cutoff, gain) {
  const n = ac.sampleRate * dur, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.06));
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff;
  const g = ac.createGain(); g.gain.value = gain; src.connect(f).connect(g).connect(ac.destination); src.start();
}
function bell(ac, freqs, dur, gain) {
  const g = ac.createGain(); g.gain.setValueAtTime(gain, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur); g.connect(ac.destination);
  for (const f of freqs) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); o.stop(ac.currentTime + dur); }
}
