// Demonstration scene 1: SpKW/Z shooting procedure at the gong on 625 m (script: docs/scenes/01-shooting-procedure/script.md).
// Builds the actors and props, defines the beats of the timeline (engine.js) and renders the evaluated state every
// frame: soldier pose (base clips + arm IK), rifle state (sling / ground, bipod, bolt, magazine, caps), cameras
// (follow, close-ups, scope view with an FFP mil-dot reticle, gong-side insert), overlays and the three shots.

const TITLE = "Scena pokazowa 1: strzelanie z SpKW/Z";
const SCENES = { 1: "Linia wyjściowa", 2: "Ładowanie magazynka", 3: "Na linię otwarcia ognia", 4: "Sprawdzenie, czy broń jest rozładowana", 5: "Luneta: zakrywki i bębny",
  6: "Ułożenie za bronią", 7: "Ładuj", 8: "Wskazanie celu i obserwacja", 9: "Pomiar celu siatką", 10: "Wiatr", 11: "Odległość ze wzoru", 12: "Karta ognia",
  13: "Nastawy na lunecie", 14: "Ognia", 15: "Pierwszy strzał", 16: "Drugi i trzeci strzał", 17: "Przerwij ogień, rozładuj", 18: "Przejrzenie broni i powrót" };
const RANGE = 625, ELEV = 6.5, WIND = 1.6;                 // m, mrad up, mrad left (dialled)
const DISP = [[0.06, 0.05], [-0.11, -0.03], [0.04, -0.12]];  // mrad, right / up: small group of the three shots
const SOUND = 343;

let running = false;

export async function play(ctx) {
  // helper modules load with the same version tag as this file, so an edited helper is never served from the cache
  const ver = new URL(import.meta.url).search;
  const [{ Timeline, makePanel, overlayLayer, sounds }, { makeRig }, { makeSordin, makeKestrel }, { makeHands, makeGloves }] =
    await Promise.all(["engine", "rig", "props", "hands"].map(n => import(`./${n}.js${ver}`)));
  if (running) return; running = true;
  const { THREE, scene, camera, hAt, meta, FIRE, gltf, clips, SkeletonUtils, GLTFLoader } = ctx;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const loader = new GLTFLoader();

  // ---------- clean stage: only our actors ----------
  for (const o of [...scene.children]) { let sk = false; o.traverse(c => { if (c.isSkinnedMesh) sk = true; }); if (sk || o.userData.distanceMarker) o.visible = false; }
  window.__walker = null; window.__camOverride = true;
  if (window.__sim && window.__sim.setHour) window.__sim.setHour(10, 8);   // a clear September morning: the rifle is lit from the side, not against the sun (author, 18 XI)
  for (const id of ["hud", "info"]) { const e = document.getElementById(id); if (e) e.style.display = "none"; }

  const [manifest, BAL, rifleG, spotG, kesG, gloveG, instG, animG] = await Promise.all([
    fetch("demo/audio/scene1/manifest.json?v=" + Date.now()).then(r => r.json()), fetch("demo/ballistics_scene1.json?v=" + Date.now()).then(r => r.json()),
    loader.loadAsync("models/grot.glb?v=" + Date.now()), loader.loadAsync("models/spotter60_stand.glb?v=" + Date.now()),
    loader.loadAsync("models/kestrel5700.glb?v=" + Date.now()), loader.loadAsync("models/gloves.glb?v=" + Date.now()),
    loader.loadAsync("models/instructor.glb?v=" + Date.now()), loader.loadAsync("models/soldier_anims.glb?v=" + Date.now())]);

  // ---------- range geometry ----------
  const fwd = V(FIRE.x, 0, FIRE.y).normalize(), left = V(fwd.z, 0, -fwd.x), up = V(0, 1, 0);
  const g = p => { p.y = hAt(p.x, p.z); return p; };
  const fp = g(V(meta.positions.firing_point[0], 0, meta.positions.firing_point[2]));
  for (const o of scene.children) if (o.isMesh && o.geometry.type === "BoxGeometry" && Math.hypot(o.position.x - fp.x, o.position.z - fp.z) < 4) o.visible = false;   // stand marker posts on the line of fire
  const W = (f, l, u = 0) => g(fp.clone().addScaledVector(fwd, f).addScaledVector(left, l)).add(V(0, u, 0));   // point in the range frame
  const yawOf = d => Math.atan2(d.x, d.z);                  // glTF +Z faces d

  // ---------- gong: red torso 0.5 x 1.0 m on chains in a frame ----------
  const gongBase = W(RANGE, 0);
  const gong = new THREE.Group(); gong.position.copy(gongBase); gong.rotation.y = yawOf(fwd.clone().negate()); scene.add(gong);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 0.8, metalness: 0.3 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.06), frameMat); p.position.set(s * 0.55, 1.0, 0); p.castShadow = true; gong.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), frameMat); bar.position.y = 2.0; gong.add(bar);
  const pivot = new THREE.Group(); pivot.position.y = 1.95; gong.add(pivot);
  // chains from the bar down to the shoulders of the plate (shoulder edge at 0.26 m above the plate centre)
  const CH = 1.95 - (1.13 + 0.255);
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, CH, 6), frameMat); c.position.set(s * 0.17, -CH / 2, 0); pivot.add(c);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), frameMat); eye.position.set(s * 0.17, -CH, 0); pivot.add(eye); }
  const torso = new THREE.Shape();                          // shoulders and head, 0.5 wide, 1.0 high, origin at the centre
  torso.moveTo(-0.25, -0.5); torso.lineTo(0.25, -0.5); torso.lineTo(0.25, 0.12); torso.quadraticCurveTo(0.25, 0.25, 0.1, 0.27);
  torso.lineTo(0.07, 0.29); torso.absarc(0, 0.39, 0.11, -0.9, Math.PI + 0.9, false); torso.lineTo(-0.1, 0.27);
  torso.quadraticCurveTo(-0.25, 0.25, -0.25, 0.12); torso.lineTo(-0.25, -0.5);
  const plateGeo = new THREE.ExtrudeGeometry(torso, { depth: 0.012, bevelEnabled: false });
  const gongCanvas = document.createElement("canvas"); gongCanvas.width = 256; gongCanvas.height = 512;
  const gongTex = new THREE.CanvasTexture(gongCanvas); gongTex.colorSpace = THREE.SRGBColorSpace;
  { const uv = plateGeo.attributes.uv, pp = plateGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 0.5 + 0.5, pp.getY(i) + 0.5); }
  const plate = new THREE.Mesh(plateGeo, [new THREE.MeshStandardMaterial({ map: gongTex, roughness: 0.6, metalness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0x7a1010 })]);
  plate.position.set(0, -0.82, 0.006); plate.rotation.y = Math.PI; plate.castShadow = true; pivot.add(plate);
  const GC = gong.localToWorld(V(0, 1.13, 0));               // plate centre (world), the aiming point
  let marksDrawn = -1;
  function drawMarks(hits) {                                 // red paint, grey splash where bullets struck
    if (hits.length === marksDrawn) return; marksDrawn = hits.length;
    const c = gongCanvas.getContext("2d"); c.fillStyle = "#b3161b"; c.fillRect(0, 0, 256, 512);
    for (const [x, y] of hits) {                              // x right, y up in metres from the centre
      const px = 128 - x / 0.5 * 256, py = 256 - y * 512;      // plate faces the shooter: mirrored
      const gr = c.createRadialGradient(px, py, 1, px, py, 14); gr.addColorStop(0, "#d8d8d4"); gr.addColorStop(0.45, "#9a9a96"); gr.addColorStop(1, "rgba(179,22,27,0)");
      c.fillStyle = gr; c.beginPath(); c.arc(px, py, 14, 0, 7); c.fill();
      c.fillStyle = "#555"; c.beginPath(); c.arc(px, py, 2.6, 0, 7); c.fill();
    }
    gongTex.needsUpdate = true;
  }
  drawMarks([]);

  // ---------- the stand: worn sand and sparse short grass (the range around it is mown, author 16 XI) ----------
  const standGrassTime = { value: 0 };
  {
    const C = W(-0.7, 0.15), R = 3.4, N = 40;
    const geo = new THREE.CircleGeometry(R, 64, 0, Math.PI * 2); geo.rotateX(-Math.PI / 2);
    const rings = new THREE.RingGeometry(0.01, R, 64, 12); rings.rotateX(-Math.PI / 2);   // rings follow the ground better than a fan
    const pp = rings.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = C.x + pp.getX(i), z = C.z + pp.getZ(i); pp.setXYZ(i, x, hAt(x, z) + 0.015, z); }
    rings.computeVertexNormals();
    const cv = document.createElement("canvas"); cv.width = cv.height = 512; const g2 = cv.getContext("2d");
    const grad = g2.createRadialGradient(256, 256, 40, 256, 256, 256); grad.addColorStop(0, "rgba(176,156,118,1)"); grad.addColorStop(0.65, "rgba(168,150,112,0.9)"); grad.addColorStop(1, "rgba(150,140,100,0)");
    g2.fillStyle = grad; g2.fillRect(0, 0, 512, 512);
    let sd = 11; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9000; i++) { const x = rr() * 512, y = rr() * 512, d = Math.hypot(x - 256, y - 256); if (d > 250) continue; const v = 120 + rr() * 90;
      g2.fillStyle = `rgba(${v},${v * 0.9},${v * 0.7},${0.25 + rr() * 0.4})`; g2.fillRect(x, y, 1 + rr() * 2, 1 + rr() * 2); }     // grains and pebbles
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const uv = rings.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) - C.x) / (2 * R) + 0.5, (pp.getZ(i) - C.z) / (2 * R) + 0.5);
    const sand = new THREE.Mesh(rings, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    sand.receiveShadow = true; scene.add(sand);
    // short tufts, sparse, a few on the sand and more towards the mown grass
    const blades = document.createElement("canvas"); blades.width = blades.height = 128; const gb = blades.getContext("2d"); gb.fillStyle = "#000"; gb.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 18; i++) { const x = 20 + rr() * 88, h = 50 + rr() * 78, l = (rr() - 0.5) * 30; gb.fillStyle = "#fff"; gb.beginPath(); gb.moveTo(x - 2, 128); gb.quadraticCurveTo(x + l * 0.3, 128 - h * 0.6, x + l, 128 - h); gb.quadraticCurveTo(x + l * 0.3 + 1, 128 - h * 0.6, x + 2, 128); gb.fill(); }
    const tuftGeo = new THREE.BufferGeometry(); { const ps = [], us = [], ix = [];
      for (let k = 0; k < 3; k++) { const an = k * Math.PI / 3, cx = Math.cos(an) * 0.5, cz = Math.sin(an) * 0.5, b0 = ps.length / 3; ps.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); us.push(0, 0, 1, 0, 1, 1, 0, 1); ix.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); }
      tuftGeo.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3)); tuftGeo.setAttribute("uv", new THREE.Float32BufferAttribute(us, 2)); tuftGeo.setIndex(ix); tuftGeo.computeVertexNormals(); }
    const bt = new THREE.CanvasTexture(blades);
    const tm = new THREE.MeshLambertMaterial({ color: 0x8c9a52, alphaMap: bt, alphaTest: 0.4, side: THREE.DoubleSide });
    tm.onBeforeCompile = sh => { sh.uniforms.time = standGrassTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float time;").replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sw = 0.12 * (sin(time * 2.1 + ip.x * 1.7 + ip.z * 1.3) + 0.5) * position.y * position.y;
        transformed.x += sw * ${(-left.x).toFixed(3)}; transformed.z += sw * ${(-left.z).toFixed(3)};`); };   // wind from the left: blades lean right
    const n = 260, tufts = new THREE.InstancedMesh(tuftGeo, tm, n), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const r = R * 0.35 + Math.pow(rr(), 0.6) * 9, an = rr() * Math.PI * 2, x = C.x + Math.cos(an) * r, z = C.z + Math.sin(an) * r, h = 0.05 + rr() * 0.11;
      if (r < R && rr() < 0.7) { i--; continue; }                     // the sand keeps only a few tufts
      q4.setFromAxisAngle(up, rr() * 6.28); m4.compose(V(x, hAt(x, z) - 0.005, z), q4, V(0.10 + rr() * 0.12, h, 0.10 + rr() * 0.12)); tufts.setMatrixAt(i, m4);
      col.setHSL(0.17 + rr() * 0.06, 0.35, 0.35 + rr() * 0.15); tufts.setColorAt(i, col);
    }
    tufts.receiveShadow = true; scene.add(tufts);
  }

  // ---------- rifle ----------
  const rifle = rifleG.scene; scene.add(rifle);
  // daylight scattered into the open action: the black-anodized inside of the receiver reads as metal, not as a cover
  // over the port, when the bolt is back (author, 18 XI); switched off with the bolt closed
  rifle.traverse(o => { if (o.isMesh && o.material && o.material.name === "bolt_steel") { o.material = o.material.clone(); o.material.color.set(window.__boltCol ?? 0x9a9da0); o.material.metalness = 0.75; o.material.roughness = 0.38; } });   // bead-blasted steel bolt carrier: seen through the port
  const portLight = new THREE.PointLight(0xfff1dc, 0, 0.22, 1.6); portLight.position.set(0.004, 0.012, -0.43); rifle.add(portLight);
  // suppressor on the muzzle brake (KBW boards photo, author 18 XI): a darker ribbed QD mount over the brake and a
  // coyote-brown can, about 4 + 17 cm, 44 mm across; rifle-local, the bore along -Z
  { const sup = new THREE.Group(); sup.name = "suppressor";
    const canM = new THREE.MeshStandardMaterial({ color: 0xa8763f, roughness: 0.55, metalness: 0.25 }), mountM = new THREE.MeshStandardMaterial({ color: 0x7c5c38, roughness: 0.45, metalness: 0.5 });
    const cyl = (r0, r1, z0, z1, m, seg = 40) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg).rotateX(Math.PI / 2), m); c.position.z = (z0 + z1) / 2; c.castShadow = true; sup.add(c); return c; };
    cyl(0.0185, 0.0195, -1.004, -1.048, mountM);                                         // mount body
    for (let i = 0; i < 6; i++) { const z = -1.010 - i * 0.0062, rib = new THREE.Mesh(new THREE.TorusGeometry(0.0196, 0.0016, 6, 32), mountM); rib.position.z = z; sup.add(rib); }
    cyl(0.020, 0.022, -1.048, -1.054, mountM);                                           // collar
    cyl(0.022, 0.022, -1.054, -1.212, canM);                                             // can
    cyl(0.022, 0.0195, -1.212, -1.222, canM);                                            // chamfered front cap
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.005, 16), new THREE.MeshBasicMaterial({ color: 0x050505 })); bore.position.z = -1.2225; bore.rotation.y = Math.PI; sup.add(bore);
    rifle.add(sup); }
  rifle.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  // black anodizing and polymer read as pure black in close-ups: lift them a little (still black, details visible)
  const lifted = new Set();
  rifle.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { if (!m.color || lifted.has(m)) continue; lifted.add(m);
    if (Math.max(m.color.r, m.color.g, m.color.b) < 0.06) { m.color.multiplyScalar(2.6); m.roughness = Math.max(0.3, (m.roughness ?? 0.6) - 0.1); } } });
  // fill light from the camera side for close-ups
  const fill = new THREE.DirectionalLight(0xfff6ea, 0); scene.add(fill, fill.target);
  const node = n => rifle.getObjectByName(n);
  const RP = { bipodF: node("bipod_folded"), bipodD: node("bipod_deployed"), ch: node("charging_handle"), dust: node("dust_cover"), mag: node("magazine"),
    sel: node("safety_selector"), bolt: node("bolt_carrier") };
  const chRest = RP.ch.position.clone(), boltRest = RP.bolt.position.clone(), selRest = RP.sel.quaternion.clone();
  const KN = { elev: node("scope_elevation"), wind: node("scope_windage"), plx: node("scope_parallax") };
  const knRest = Object.fromEntries(Object.entries(KN).map(([k, o]) => [k, o ? o.quaternion.clone() : null]));
  // turret scales read at the index (author, 18 XI): from the engraved mesh itself (uv u = angle) find how u maps to the
  // angle about the knob axis, then turn the knob so the set value sits at the index mark. Elevation 12 mrad per turn
  // (white 0-11, yellow 12-23), windage 0 on top with R clockwise, parallax 50 m - inf; index: yellow mark / top.
  const scaleFit = (knob, axis) => { let sx = 0, sy = 0, tx = 0, ty = 0, n = 0;
    const ang = p => axis === "Y" ? Math.atan2(p.x, p.z) : Math.atan2(p.z, p.y);
    knob.traverse(o => { if (!o.isMesh || !/_scale$/.test(o.material.name || "")) return; const P = o.geometry.attributes.position, U = o.geometry.attributes.uv; if (!U) return;
      const m = new THREE.Matrix4().copy(knob.matrixWorld).invert().multiply(o.matrixWorld);
      for (let i = 0; i < P.count; i += 3) { const th = ang(V().fromBufferAttribute(P, i).applyMatrix4(m)), u = U.getX(i) * 2 * Math.PI;
        sx += Math.cos(u - th); sy += Math.sin(u - th); tx += Math.cos(u + th); ty += Math.sin(u + th); n++; } });
    const c = Math.hypot(sx, sy) >= Math.hypot(tx, ty) ? 1 : -1, d = c > 0 ? Math.atan2(sy, sx) : Math.atan2(ty, tx);   // u = c*th + d (rad)
    return { c, d, n, ang }; };
  rifle.updateMatrixWorld(true);
  const SCF = { elev: KN.elev && scaleFit(KN.elev, "Y"), wind: KN.wind && scaleFit(KN.wind, "X"), plx: KN.plx && scaleFit(KN.plx, "X") };
  const idxElev = (() => { let p = null; rifle.traverse(o => { if (!p && o.isMesh && o.material && o.material.name === "index_yellow") p = o.getWorldPosition(V()); });
    return p ? SCF.elev.ang(KN.elev.worldToLocal(p)) : Math.PI; })();
  const PLX = [50, 70, 100, 150, 200, 300, 500, 1000, 3000];
  const dialAngle = (key, S) => { const f = SCF[key]; if (!f || !f.n) return 0; let u, th;
    if (key === "elev") { u = (S.rifle.elev * 10 + 0.5) / 120; th = idxElev; }
    else if (key === "wind") { u = (-S.rifle.wind * 10 + 0.5) / 120; th = 0; }                // wind > 0 = left
    else { const dd = Math.max(50, Math.min(3000, S.rifle.parallax)); let i = 0; while (i < PLX.length - 2 && dd > PLX[i + 1]) i++;
      const k = Math.log(dd / PLX[i]) / Math.log(PLX[i + 1] / PLX[i]); u = ((i + k) * 10 + 0.5) / 90; th = 0; }
    const thT = (u * 2 * Math.PI - f.d) / f.c; return th - thT; };
  window.__scf = { SCF, idxElev };
  const EYE = V(0, 0.0857, -0.1414), MUZZLE = V(0, 0, -1.223) /* front of the suppressor */, BIPOD_FOOT = V(0, -0.2513, -0.873);
  // on the ground: bipod feet at the firing point, line of sight on the gong centre
  const feet = W(0, 0);
  const aim = GC.clone().sub(feet.clone().add(V(0, 0.33, 0))).normalize();
  const qGround = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), aim, up));   // Matrix4.lookAt: +Z points from the target to the eye, so -Z (muzzle) -> aim
  const pGround = feet.clone().sub(BIPOD_FOOT.clone().applyQuaternion(qGround));
  const RL = (p, q = qGround, pos = pGround) => p.clone().applyQuaternion(q).add(pos);    // rifle-local -> world (ground pose)
  // scope caps
  // flip-up scope caps on hinges (author, 18 XI, as in the photos): a collar on each end of the scope and a lid on a
  // hinge; the objective lid flips up, the eyepiece lid swings to the left side and lies along the scope, clear of the
  // turrets. State per cap: openness 0 (closed) .. 1 (open); "on"/"pouch" closed, anything else open
  const capMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const CAP_ON = { F: V(0, 0.0857, -0.576), R: V(0, 0.0857, -0.228) };
  function makeFlipCap(r, side) {
    const g = new THREE.Group(), lid = new THREE.Group();
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.016, 28, 1, true).rotateX(Math.PI / 2), capMat);
    collar.material = capMat.clone(); collar.material.side = THREE.DoubleSide; g.add(collar);
    const hingeAt = side === "F" ? V(0, r + 0.004, 0) : V(-(r + 0.004), 0, 0);            // top of the objective / left of the eyepiece
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.012, 8), capMat);
    if (side === "F") knuckle.rotation.z = Math.PI / 2; knuckle.position.copy(hingeAt); g.add(knuckle);
    lid.position.copy(hingeAt); g.add(lid);
    const out = side === "F" ? -1 : 1;                                                        // lid sits outside the end: forward / back
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0035, r + 0.0035, 0.006, 28).rotateX(Math.PI / 2), capMat);
    disc.position.copy(hingeAt.clone().negate()).add(V(0, 0, out * 0.011)); lid.add(disc);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(side === "F" ? 0.012 : 0.006, side === "F" ? 0.006 : 0.012, 0.004), capMat);   // thumb tab opposite the hinge
    tab.position.copy(hingeAt.clone().negate().multiplyScalar(2)).add(V(0, 0, out * 0.011)); lid.add(tab);
    g.userData = { lid, side }; scene.add(g); return g;
  }
  const capF = makeFlipCap(0.031, "F"), capR = makeFlipCap(0.024, "R");
  const capOpenOf = st => typeof st === "number" ? st : (st === "on" || st === "pouch" ? 0 : 1);
  function placeCap(g, side, state) {
    g.position.copy(rifle.localToWorld(CAP_ON[side].clone())); g.quaternion.copy(rifle.quaternion);
    const k = ease(Math.max(0, Math.min(1, window.__capTest ?? capOpenOf(state)))), lid = g.userData.lid;   // __capTest: test hook
    if (side === "F") lid.rotation.set(-k * 1.92, 0, 0);          // up and over, ~110 degrees
    else lid.rotation.set(0, k * 1.62, 0);                         // to the left and forward, flat along the scope tube
  }
  // rear bag under the butt
  // rear bag: flat sand-filled pillow ~20 x 13 x 6 cm in woodland camouflage, with a carry loop; lies flat under the
  // butt, or on its side when the butt sits higher than the flat bag
  const bagTop = RL(V(0, -0.118, -0.075)), bagH = Math.max(0.05, bagTop.y - hAt(bagTop.x, bagTop.z));
  const bag = makeBag(THREE, bagH); bag.position.set(bagTop.x, bagTop.y - bagH, bagTop.z); bag.rotation.y = yawOf(fwd); scene.add(bag);
  // sling strap (only while carried)
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x3d3a2a, roughness: 0.9 }); let strap = null;

  // small props
  const propMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const notebook = new THREE.Group(); { const cov = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.15), propMat(0x2f3b28)); const pg = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.009, 0.144), propMat(0xf2efe6)); pg.position.y = 0.002; notebook.add(cov, pg); }
  notebook.castShadow = true; scene.add(notebook);
  // Kestrel 5700: body, screen, impeller cage on top with a vane wheel that spins in the wind
  // Kestrel 5700 Elite (props.js), impeller cover open; the impeller spins about the axis through the head
  // Kestrel 5700 (bought model, impeller cover swung open); the glTF has the display along +x, turned so it faces +z
  const kestrel = new THREE.Group(), impeller = kesG.scene.getObjectByName("kestrel5700x_fan");
  kesG.scene.rotation.y = -Math.PI / 2; kestrel.add(kesG.scene); scene.add(kestrel);
  kesG.scene.traverse(o => { if (o.isMesh) { o.castShadow = true;
    if (o.material.name === "kestrel5700x_lcd") {                 // the readout on the display
      const c = document.createElement("canvas"); c.width = 360; c.height = 230; const x = c.getContext("2d");
      // wind speed large in m/s, as the 5700 shows it in its wind screen (author, 18 XI)
      x.fillStyle = "#b9c3a8"; x.fillRect(0, 0, 360, 230); x.fillStyle = "#1b241b";
      x.font = "bold 26px monospace"; x.fillText("WIND SPEED", 20, 40);
      x.font = "bold 92px monospace"; x.fillText("3.0", 20, 140); x.font = "bold 40px monospace"; x.fillText("m/s", 225, 140);
      x.font = "bold 26px monospace"; x.fillText("DIR 9:00   8.0\u00b0C", 20, 200);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
      o.material = o.material.clone(); o.material.map = t; o.material.emissiveMap = null; o.material.emissive.set(0x000000); } } });
  const magProp = RP.mag.clone(); scene.add(magProp);
  const rounds = []; for (let i = 0; i < 3; i++) { const r = new THREE.Group(); const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.051, 10), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.3 })); const bl = new THREE.Mesh(new THREE.ConeGeometry(0.0039, 0.022, 10), new THREE.MeshStandardMaterial({ color: 0xb06a3a, metalness: 0.8, roughness: 0.3 })); bl.position.y = 0.036; r.add(cs, bl); scene.add(r); rounds.push(r); }
  const caseEject = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.051, 8), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.3 })); scene.add(caseEject);

  // tracer (stretched glowing cylinder) and muzzle flash
  const tracer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a1e, toneMapped: false }));
  scene.add(tracer);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.9 })); scene.add(flash);
  const flashLight = new THREE.PointLight(0xffb060, 0, 6); scene.add(flashLight);

  // spotter on the tall tripod, left of the shooter, aimed at the gong
  const spotter = spotG.scene; spotter.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const spotPos = W(-0.35, 1.7); spotter.position.copy(spotPos); spotter.rotation.y = yawOf(fwd) + Math.PI; scene.add(spotter);

  // ---------- fence: the buildings are separated from the range by a ~2 m wire-mesh fence on a low concrete base
  // (author, 18 XI); line traced on the orthophoto, world x/z ----------
  { const FENCE = [[397, 1890], [392, 1853], [403, 1846], [441, 1899], [468, 1940], [480, 1985]].map(([x, z]) => V(x, 0, z));   // straight to the road, along the road, down the side of the stand (orthophoto; author 18 XI)
    const meshTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
      // galvanized chain-link: square ~5 cm meshes set at 45 degrees, so they read as diamonds (author, 18 XI)
      x.strokeStyle = "rgba(176,180,178,1)"; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.stroke();
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const wireM = new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
    const postM = new THREE.MeshStandardMaterial({ color: 0x9da2a0, metalness: 0.6, roughness: 0.45 }), baseM = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.95 });
    const postG = new THREE.BoxGeometry(0.06, 2.1, 0.06), railG = new THREE.CylinderGeometry(0.02, 0.02, 1, 8), fence = new THREE.Group(); fence.name = "fence";
    for (let i = 0; i < FENCE.length - 1; i++) {
      const a = FENCE[i], b = FENCE[i + 1], L = a.distanceTo(b), n = Math.max(1, Math.round(L / 3));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, k / n), q = a.clone().lerp(b, (k + 1) / n), y0 = hAt(p.x, p.z), y1 = hAt(q.x, q.z);
        const post = new THREE.Mesh(postG, postM); post.position.set(p.x, y0 + 1.05 + 0.05, p.z); fence.add(post);
        const len = p.distanceTo(q), mid = p.clone().lerp(q, 0.5), ym = (y0 + y1) / 2, yaw = Math.atan2(q.x - p.x, q.z - p.z);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, len), baseM); base.position.set(mid.x, ym + 0.08, mid.z); base.rotation.y = yaw; fence.add(base);
        const net = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.75), wireM.clone()); net.material.map = meshTex.clone(); net.material.map.repeat.set(len / 0.0707, 1.75 / 0.0707);   // one tile = one diamond, diagonal of a 5 cm square net.material.map.needsUpdate = true;
        net.position.set(mid.x, ym + 0.3 + 0.875, mid.z); net.rotation.y = yaw + Math.PI / 2; fence.add(net);
        const rail = new THREE.Mesh(railG, postM); rail.scale.y = len; rail.position.set(mid.x, ym + 2.07, mid.z); rail.rotation.set(Math.PI / 2, yaw, 0, "YXZ"); fence.add(rail);
      }
      const end = FENCE[FENCE.length - 1]; if (i === FENCE.length - 2) { const post = new THREE.Mesh(postG, postM); post.position.set(end.x, hAt(end.x, end.z) + 1.1, end.z); fence.add(post); }
    }
    // small shelter with a table for the ammunition NCO, on the range side of the fence level with the stand (author, 18 XI)
    { const sh = new THREE.Group(), at = (() => { const a = FENCE[2], b = FENCE[3], d = b.clone().sub(a).normalize(), n = V(d.z, 0, -d.x);   // range side, 2 m clear of the fence (author, 18 XI)
        if (n.x < 0) n.negate(); const p = a.clone().lerp(b, (1878 - a.z) / (b.z - a.z)); return p.addScaledVector(n, 2.0 + 1.35); })(),   // level with the stand
        yaw = Math.atan2(FENCE[3].x - FENCE[2].x, FENCE[3].z - FENCE[2].z) + Math.PI / 2, wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
      const roofM = new THREE.MeshStandardMaterial({ color: 0x55605a, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide });
      for (const [x, z, h] of [[-1.5, -1.1, 2.5], [1.5, -1.1, 2.5], [-1.5, 1.1, 2.2], [1.5, 1.1, 2.2]]) { const pst = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), postM); pst.position.set(x, h / 2, z); sh.add(pst); }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.04, 2.7), roofM); roof.position.set(0, 2.38, 0); roof.rotation.x = Math.atan2(0.3, 2.2); sh.add(roof);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.8), wood); top.position.set(0, 0.76, 0); sh.add(top);
      for (const [x, z] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), wood); leg.position.set(x, 0.37, z); sh.add(leg); }
      for (const z of [-0.7, 0.7]) { const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.3), wood); bench.position.set(0, 0.45, z); sh.add(bench);
        for (const x of [-0.85, 0.85]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.26), wood); l.position.set(x, 0.22, z); sh.add(l); } }
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.16), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7 })); box.position.set(0.5, 0.87, 0.1); sh.add(box);   // ammo can
      sh.position.set(at.x, hAt(at.x, at.z), at.z); sh.rotation.y = yaw; fence.add(sh); }
    fence.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(fence); }
  // ---------- sparse fair-weather clouds (author, 18 XI): a few soft sprites high up, drifting slowly ----------
  const clouds = new THREE.Group(); clouds.name = "clouds";
  { const cloudTex = seed => { const c = document.createElement("canvas"); c.width = 512; c.height = 256; const x = c.getContext("2d"); let r = seed;
      const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 42; i++) { const cx = 90 + rnd() * 330, cy = 120 + (rnd() - 0.5) * 70 - Math.sin((cx - 90) / 330 * Math.PI) * 35, rr = 28 + rnd() * 55;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(0.6, "rgba(250,250,252,0.22)"); g.addColorStop(1, "rgba(245,245,250,0)");
        x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    let r = 7; const rnd = () => (r = (r * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(1234 + i * 97), transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
      const ang = rnd() * Math.PI * 2, d = 900 + rnd() * 1800, w = 380 + rnd() * 520;
      sp.position.set(fp.x + Math.cos(ang) * d, 520 + rnd() * 380, fp.z + Math.sin(ang) * d); sp.scale.set(w, w * 0.42, 1); sp.userData.v = 1.5 + rnd() * 1.5; clouds.add(sp); }
    scene.add(clouds); }

  // ---------- soldiers ----------
  // src: the model with its own clips; extra: clips of the other model (same Mixamo bone names) used where it has none
  function soldier(src = gltf, extra = []) {
    const m = SkeletonUtils.clone(src.scene); m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } }); scene.add(m);
    const mixer = new THREE.AnimationMixer(m), acts = {};
    const own = new Set(src.animations.map(c => c.name));
    for (const c of [...src.animations, ...extra.filter(c => !own.has(c.name))]) { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); a.paused = true; acts[c.name] = a; }
    // The mixer writes a bone only when its clip value changed since the last frame, so on a still pose the IK and
    // breathing offsets of the previous frame would stay and pile up. Keep the clean clip pose and restore it first.
    const bones = []; m.traverse(o => { if (o.isBone) bones.push(o); });
    let clean = null;
    const pose = list => {                                  // list: [[clip, time, weight], ...]
      if (clean) bones.forEach((b, i) => { b.position.copy(clean[i][0]); b.quaternion.copy(clean[i][1]); b.scale.copy(clean[i][2]); });
      for (const a of Object.values(acts)) a.setEffectiveWeight(0);
      for (const [n, t, w] of list) { const a = acts[n]; if (!a) continue; a.setEffectiveWeight(w); a.time = Math.max(0, Math.min(t, a.getClip().duration - 1e-3)); }
      mixer.update(0);
      clean = bones.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
      m.updateMatrixWorld(true);
    };
    return { m, mixer, acts, pose, rig: makeRig(THREE, m) };
  }
  const man = soldier(gltf, animG.animations), inst = soldier(instG, gltf.animations);
  // national flag patches on both sleeves (author, 18 XI): regulation 5:8, 42 x 26 mm, white up, on the outer side of
  // the upper arm a third of the way down to the elbow; placed by a ray onto the sleeve and carried by the arm bone
  { const c = document.createElement("canvas"); c.width = 80; c.height = 50; const x = c.getContext("2d");
    x.fillStyle = "#f2f2ee"; x.fillRect(0, 0, 80, 25); x.fillStyle = "#c8102e"; x.fillRect(0, 25, 80, 25); x.strokeStyle = "#3b3f2c"; x.lineWidth = 3; x.strokeRect(1.5, 1.5, 77, 47);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4 });
    inst.pose([["Idle", 0, 1]]); inst.m.updateMatrixWorld(true);
    const targets = []; inst.m.traverse(o => { if (o.isMesh && !/flag/.test(o.name)) targets.push(o); });
    const hips = inst.rig.B.Hips.getWorldPosition(V()), ray = new THREE.Raycaster();
    for (const P of ["Left", "Right"]) {
      const sh = inst.rig.B[P + "Arm"].getWorldPosition(V()), el = inst.rig.B[P + "ForeArm"].getWorldPosition(V()), axis = sh.clone().sub(el).normalize();
      const p0 = sh.clone().lerp(el, 0.33), out = p0.clone().sub(V(hips.x, p0.y, hips.z)); out.addScaledVector(axis, -out.dot(axis)).normalize();
      ray.set(p0.clone().addScaledVector(out, 0.3), out.clone().negate()); const hit = ray.intersectObjects(targets, false)[0]; if (!hit) continue;
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : out.clone(); if (n.dot(out) < 0) n.negate();
      const vy = V(0, 1, 0), up_ = vy.clone().addScaledVector(n, -vy.dot(n)).normalize(), across = up_.clone().cross(n).normalize();   // level, white up
      const flagM = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.02625), fm); flagM.name = "flag_" + P;
      flagM.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up_, n)); flagM.position.copy(hit.point).addScaledVector(n, 0.004);
      scene.add(flagM); inst.rig.B[P + "Arm"].attach(flagM); } }   // + Meshy motions: going prone, getting up   // instructor: wz.93 uniform model (Meshy, from the KBW boards)
  // active hearing protection: two cups over the ears and a headband, on the head bone of both soldiers
  // active hearing protection: Sordin Supreme Pro-X LED (props.js) on the head bone of both soldiers, cups outside the hood
  // head width, under the hood (author, 17 XI)
  const earDefenders = sd => { const h = makeSordin(THREE, { earX: 0.082, earY: 0.072, apexY: 0.205 }); sd.rig.B.Head.add(h); return h; };
  earDefenders(man);
  // the instructor has no hood: a smaller head, cups higher over the ears, band over the crown (author, 18 XI)
  const instEars = (() => { const h = makeSordin(THREE, window.__earTune || { earX: 0.074, earY: 0.105, apexY: 0.302 }); inst.rig.B.Head.add(h); return h; })();
  const handsMan = makeGloves(THREE, man, gloveG.scene, { clone: SkeletonUtils.clone }), handsInst = makeGloves(THREE, inst, gloveG.scene, { clone: SkeletonUtils.clone });

  // measure poses once: where the eye (headfront) sits in the prone pose, relative to the root
  const headfront = man.m.getObjectByName("headfront");
  man.m.position.set(0, 0, 0); man.m.rotation.set(0, 0, 0); man.pose([["Prone_Fire", 0.5, 1]]);
  const eyeProne = headfront ? headfront.getWorldPosition(V()) : man.rig.B.Head.getWorldPosition(V());
  // slung rifle relative to the upper spine, measured in the walking pose (same layout as sling_walk.js)
  man.pose([["Walking", 0, 1]]);
  const slungInSpine = (() => {
    const inv = man.m.matrixWorld.clone().invert(), loc = b => b.getWorldPosition(V()).applyMatrix4(inv);
    const hips = loc(man.rig.B.Hips), chest = loc(man.rig.B.Spine2), rSh = loc(man.rig.B.RightArm), lSh = loc(man.rig.B.LeftArm);
    const md = V(0.62, -0.76, 0.06).normalize(), ru = V(0.77, 0.64, 0); ru.sub(md.clone().multiplyScalar(ru.dot(md))).normalize();
    const rs = md.clone().cross(ru).normalize(), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rs, ru, md.clone().negate()));
    const ga = hips.clone().lerp(chest, 0.45); ga.x = rSh.x * 0.62; ga.z = chest.z + rSh.distanceTo(lSh) * 0.72;   // against the ghillie, not inside it
    const pos = ga.sub(V(0, -0.095, -0.318).applyQuaternion(q));
    return man.rig.B.Spine2.matrixWorld.clone().invert().multiply(man.m.matrixWorld.clone().multiply(new THREE.Matrix4().compose(pos, q, V(1, 1, 1))));
  })();

  // places: kneeling behind the rifle, prone with the eye at the scope, instructor beside the spotter
  const yawFwd = yawOf(fwd);
  const KNEEL = W(-0.85, 0.36);                                        // kneeling left of the rifle, level with the stock
  const KNEEL_YAW = yawOf(RL(V(0, 0, -0.45)).sub(KNEEL).setY(0));        // turned towards the receiver
  const eyeW = RL(EYE).addScaledVector(V(0, 0, 1).applyQuaternion(qGround), 0.07);             // 7 cm behind the eyepiece
  const PRONE = (() => { const e = eyeProne.clone().applyAxisAngle(up, yawFwd); const p = eyeW.clone().sub(e); p.y = hAt(p.x, p.z); return p; })();
  const START = W(-25, 4.0), LINE = W(-15, 1.2), INST = W(-1.2, 2.6);   // start line ~15 m behind the stand

  // ---------- overlays ----------
  const OV = overlayLayer(), snd = sounds();
  const card = (x, y, w, inner, extra = "") => [inner, `left:${x};top:${y};width:${w};background:#f4f1e8;color:#1d2a40;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.5);padding:14px 18px;font:20px/1.45 'Segoe Print','Bradley Hand','Comic Sans MS',cursive;${extra}`];
  const reveal = (lines, u) => lines.slice(0, Math.ceil(lines.length * Math.min(1, u * 1.15) - 1e-6)).join("<br>");
  const dial = (title, value, lo, hi, unit) => {             // turret dial seen from above: index line + rotating scale
    // hi = mrad per turn (PM II: 12, 120 clicks); a windage dial (lo < 0) counts R clockwise and L anticlockwise from 0
    const N = hi * 10, step = 360 / N, turns = value / hi, a = -turns * 360, ticks = [];
    for (let k = 0; k < N; k++) { const r1 = 92, r2 = k % 10 === 0 ? 72 : k % 5 === 0 ? 78 : 84, an = (k * step + a) * Math.PI / 180;
      ticks.push(`<line x1="${110 + r1 * Math.sin(an)}" y1="${110 - r1 * Math.cos(an)}" x2="${110 + r2 * Math.sin(an)}" y2="${110 - r2 * Math.cos(an)}" stroke="#ddd" stroke-width="${k % 10 ? 1 : 2.4}"/>`);
      if (k % 10 === 0) ticks.push(`<text x="${110 + 60 * Math.sin(an)}" y="${116 - 60 * Math.cos(an)}" fill="#fff" font-size="15" text-anchor="middle" font-family="monospace">${lo < 0 ? (k <= N / 2 ? k / 10 : (N - k) / 10) : k / 10}</text>`); }
    return [`<div style="font:600 15px system-ui;color:#f2c94c;margin-bottom:4px">${title}</div><svg width="220" height="220"><circle cx="110" cy="110" r="100" fill="#151515" stroke="#444" stroke-width="3"/>${ticks.join("")}<polygon points="110,6 103,-6 117,-6" fill="#f2c94c" transform="translate(0,10)"/></svg><div style="font:700 22px monospace;color:#fff;text-align:center">${Math.abs(value).toFixed(1).replace(".", ",")} ${unit}${lo < 0 && Math.abs(value) > 0.04 ? (value > 0 ? " R" : " L") : ""}</div>`,
      `background:rgba(0,0,0,.78);padding:12px 16px;border-radius:8px;`];
  };
  const turretDialAt = (x, y, ...a) => { const [h, css] = dial(...a); return [h, `left:${x};top:${y};` + css]; };

  // ---------- state ----------
  const init = () => ({
    man: { at: START.clone(), yaw: yawOf(LINE.clone().sub(START)), clips: [["Walking", 0, 1]], R: "grip", L: null, look: null, curl: { R: 0.8, L: 0.3 }, walk: 0 },
    inst: { at: INST.clone(), yaw: yawOf(KNEEL.clone().sub(INST)), clips: null, walk: 0, lean: 0, look: "shooter" },
    rifle: { mode: "sling", blend: 0, bipod: false, rack: 0, boltOpen: false, magIn: false, safety: "Z", capF: "on", capR: "on", elev: 0.8, wind: -0.2,   /* 0.2 mrad R (wind > 0 = left) */ parallax: 300 },
    props: { notebook: null, kestrel: null, mag: null, rounds: 0, roundsInMag: 0 },
    cam: { kind: "follow", off: [2.6, 1.3, 2.4], look: [0, 1.1, 0] },
    scope: null, ov: {}, shots: [], recoil: 0,
  });

  // ---------- beats ----------
  const beats = [];
  const B = (scene, say, act, o = {}) => beats.push({ scene, say, act, ...o });
  const lerp = (a, b, u) => a + (b - a) * u, ease = u => u * u * (3 - 2 * u), seg = (u, a, b) => Math.min(1, Math.max(0, (u - a) / (b - a)));
  const walkTo = (S, from, to, u) => { S.man.at = from.clone().lerp(to, u); S.man.yaw = yawOf(to.clone().sub(from)); };
  const kneelPose = S => { S.man.at = KNEEL.clone(); S.man.yaw = KNEEL_YAW; S.man.clips = [["Kneel_Work", window.__kwT ?? 2.4, 1]]; };   // Meshy "kneel and work on the rifle", a calm frame (a looping clip made him rock and jump)
  const pronePose = S => { S.man.at = PRONE.clone(); S.man.yaw = yawFwd; S.man.clips = [["Prone_Fire", 0.5, 1]]; };
  const onGround = S => { S.rifle.mode = "ground"; S.rifle.bipod = true; };
  const shootingHands = S => { S.man.R = "grip"; S.man.L = "bag"; S.man.curl = { R: 0.8, L: 0.6 }; };
  const scopeCam = (S, o) => { S.cam = { kind: "scope" }; S.scope = { mag: 12, yaw: 0, pitch: 0, breath: 0.25, blur: 0, ...o }; };

  // ======== scene list follows the range commands (author, 17 XI); the instructor gives the target without the distance ========
  const SAFE_OV = S => [`Skrzydełko bezpiecznika: <b>${S.rifle.safety === "Z" ? "Z – zabezpieczony" : "P – ogień pojedynczy"}</b>`, "left:50%;transform:translateX(-50%);top:12%;background:rgba(0,0,0,.75);color:#fff;padding:8px 16px;border-radius:6px;font:18px system-ui"];
  const SLOW_OV = ["Zwolnione tempo 10×", "right:3%;top:4%;background:rgba(0,0,0,.6);color:#f2c94c;padding:6px 12px;border-radius:5px;font:600 16px system-ui"];
  const instCam = S => { S.inst.speak = true; S.cam = { kind: "world", pos: W(-3.4, 4.6, 1.55), look: S.inst.at.clone().add(V(0, 1.45, 0)), fov: 30 }; };
  const cmd = (scene, key, fn = () => {}, dur = 0) => B(scene, key, (S, u) => { fn(S, u); instCam(S); }, dur ? { dur } : {});
  // 1 start line
  cmd(1, "s01.cmd", S => { S.man.clips = [["Idle", 0, 1]]; });
  B(1, "s01.intro", (S, u) => { walkTo(S, START, LINE, u); S.man.clips = [["Walking", 0, 1]]; S.man.walk = u * START.distanceTo(LINE); S.cam = { kind: "follow", off: [2.8, 1.2, 1.6], look: [0, 1.0, 0] }; });
  B(1, "s01.carry", (S, u) => { S.man.clips = [["Idle", u * 4, 1]]; S.cam = { kind: "follow", off: [0.6, 1.25, 1.3], look: [0.05, 1.0, 0] }; });
  B(1, "s01.ears", (S, u) => { S.man.clips = [["Idle", 4 + u * 6, 1]]; S.cam = u < 0.55 ? { kind: "head", who: "man" } : { kind: "head", who: "inst" }; });
  // 2 load the magazine on the start line
  cmd(2, "s02.cmd", S => { S.man.clips = [["Idle", 10, 1]]; });
  B(2, "s02.load", (S, u) => { S.man.clips = [["Idle", 10 + u * 3, 1]]; S.man.R = { man: [[-0.07, 1.06, 0.33], [0.0, 1.06, 0.38]] }; S.man.L = { man: [[0.10, 1.02, 0.31], [0.02, 1.04, 0.37]] };
    S.props.mag = "chest"; S.props.rounds = 3; S.props.roundsInMag = Math.floor(seg(u, 0.1, 0.9) * 3.2); S.man.look = "mag"; S.cam = { kind: "follow", off: [0.25, 1.3, 1.25], look: [0.0, 1.0, 0.3], fov: 38 }; });
  B(2, "s02.pouch", (S, u) => { S.man.clips = [["Idle", 13 + u * 3, 1]]; S.props.roundsInMag = 3; S.props.mag = u < 0.5 ? "chest" : null; S.man.L = u < 0.5 ? { man: [[0.10, 1.02, 0.31], [0.02, 1.04, 0.37]] } : null;
    S.cam = { kind: "follow", off: [0.9, 1.2, 1.6], look: [0.05, 0.95, 0] }; });
  // 3 to the firing line: walk, kneel, unsling, bipod, place
  cmd(3, "s03.cmd", S => { S.man.clips = [["Idle", 16, 1]]; });
  B(3, "s03.walk", (S, u) => { const to = KNEEL.clone().addScaledVector(fwd, -0.6); walkTo(S, LINE, to, u); S.man.clips = [["Walking", 0, 1]]; S.man.walk = u * LINE.distanceTo(to); S.cam = { kind: "follow", off: [2.4, 1.2, 2.2], look: [0, 1.0, 0] }; });
  B(3, "s03.kneel", (S, u) => { const k = ease(seg(u, 0, 0.45)); S.man.at = S.man.at.clone().lerp(KNEEL, k); S.man.yaw = KNEEL_YAW;
    S.man.clips = [["Kneel_on_One_Knee_and_Stand", lerp(1.9, 0.0, k), 1]]; S.rifle.mode = "carry"; S.rifle.blend = ease(seg(u, 0.45, 1)) * 0.6; S.man.L = "handguard"; S.cam = { kind: "follow", off: [2.2, 0.9, 1.4], look: [0, 0.6, 0] }; });
  B(3, "s03.bipod", (S, u) => { kneelPose(S); S.rifle.mode = "carry"; S.rifle.blend = 0.6; S.rifle.bipod = u > 0.55; S.man.R = "grip"; S.man.L = "bipod";
    S.cam = { kind: "rifle", pos: [-0.55, -0.05, -0.75], look: [0, -0.15, -0.85] }; });
  B(3, "s03.place", (S, u) => { kneelPose(S); S.rifle.mode = "carry"; S.rifle.bipod = true; S.rifle.blend = lerp(0.6, 1, ease(u)); S.man.L = "handguard"; S.cam = { kind: "follow", off: [2.0, 0.9, 1.0], look: [0, 0.4, 0.5] }; });
  // 4 unloaded check
  const kneelWork = S => { kneelPose(S); onGround(S); S.man.L = "handguard"; S.man.lean = window.__kwLean ?? 0.2; S.man.kneelHinge = true; };   // the clip already leans over the rifle: only a little extra bend   // deep bend: the shoulder must come down to a rifle 25 cm above the ground
  B(4, "s04.why", (S, u) => { kneelWork(S); S.man.R = "grip"; S.cam = { kind: "follow", off: [1.7, 0.75, 1.2], look: [0, 0.45, 0.5] }; });
  B(4, "s04.open", (S, u) => { kneelWork(S); S.man.R = "charging"; S.rifle.rack = Math.sin(Math.PI * seg(u, 0.15, 0.7)); S.rifle.boltOpen = u > 0.45;
    S.cam = { kind: "rifle", pos: [0.42, 0.12, -0.45], look: [0.02, 0, -0.5] }; });
  B(4, "s04.look", (S, u) => { kneelWork(S); S.rifle.boltOpen = true; S.man.R = "grip"; S.man.look = "port"; S.cam = { kind: "rifle", pos: [0.2, 0.06, -0.43], look: [0.0, -0.02, -0.43], fov: 32 }; });
  B(4, "s04.finger", (S, u) => { kneelWork(S); S.rifle.boltOpen = true; S.man.R = "chamber"; S.man.curl.R = 0.45; S.man.look = "port"; S.cam = { kind: "rifle", pos: [0.34, 0.1, -0.33], look: [0.03, 0, -0.44], fov: 30 }; });
  B(4, "s04.glove", (S, u) => { kneelWork(S); S.rifle.boltOpen = true; S.man.R = "grip"; S.man.curl.R = 0.45;   // on the grip, index straight along the receiver
    S.cam = { kind: "hand", dist: 0.42, fov: 34 };
    S.ov.glove = [`<b>Rękawica z uciętym palcem wskazującym</b><br>Goły opuszek na spuście: strzelec czuje moment zwolnienia spustu.`, "left:50%;transform:translateX(-50%);top:14%;background:rgba(0,0,0,.75);color:#fff;padding:10px 16px;border-radius:6px;font:17px system-ui;max-width:520px;text-align:center"]; });
  // 5 caps and turrets
  // each cap: the hand goes to the lid's tab, flips it open on its hinge and goes back to the grip
  const capMove = (S, side, u) => {
    S.man.R = u < 0.35 ? { from: "grip", to: "cap" + side, k: ease(seg(u, 0, 0.35)) } : u < 0.65 ? "cap" + side : { from: "cap" + side, to: "grip", k: ease(seg(u, 0.65, 1)) };
    S.rifle["cap" + side] = seg(u, 0.38, 0.62); };
  B(5, "s05.caps", (S, u) => { kneelWork(S); S.rifle.boltOpen = true;
    if (u < 0.5) capMove(S, "F", u * 2); else { S.rifle.capF = "ground"; capMove(S, "R", (u - 0.5) * 2); }
    S.cam = { kind: "rifle", pos: [0.50, 0.10, -0.55], look: [0.03, 0.06, -0.40], near: true, fov: 42 }; });
  const capsOff = S => { kneelWork(S); S.rifle.boltOpen = true; S.rifle.capF = S.rifle.capR = "ground"; };
  B(5, "s05.turrets", (S, u) => { capsOff(S); S.man.R = "elev"; S.cam = { kind: "rifle", pos: [0.46, 0.16, -0.50], look: [0, 0.11, -0.41], near: true, fov: 40 }; });
  B(5, "s05.elev", (S, u) => { capsOff(S); S.man.R = "elev"; S.rifle.elev = lerp(0.8, 0, ease(seg(u, 0.35, 0.8)));
    S.cam = { kind: "rifle", pos: [0.06, 0.24, -0.62], look: [0, 0.12, -0.41], near: true, fov: 34 }; S.ov.dial = turretDialAt("6%", "18%", "Bęben wysokości", S.rifle.elev, 0, 12, "mrad"); });
  B(5, "s05.wind", (S, u) => { capsOff(S); S.rifle.elev = 0; S.man.R = "windage"; S.rifle.wind = lerp(-0.2, 0, ease(seg(u, 0.3, 0.7)));
    S.cam = { kind: "rifle", pos: [0.16, 0.13, -0.62], look: [0.03, 0.088, -0.41], near: true, fov: 34 }; S.ov.dial = turretDialAt("6%", "18%", "Bęben poprawek bocznych", -S.rifle.wind, -6, 12, "mrad"); });
  // 6 prone behind the rifle (still unloaded, action open)
  const ready = S => { onGround(S); S.rifle.boltOpen = true; S.rifle.capF = S.rifle.capR = "ground"; S.rifle.elev = 0; S.rifle.wind = 0; };
  B(6, "s06.prone", (S, u) => { ready(S); const k = ease(u); S.man.at = KNEEL.clone().lerp(PRONE, k); S.man.yaw = lerp(KNEEL_YAW, yawFwd, k);
    // Meshy "go prone" from the moment the soldier is on one knee, settling into the shooting pose at the end
    const w = ease(seg(u, 0.78, 1)); S.man.clips = [["Go_Prone", lerp(1.7, 5.9, seg(u, 0, 0.85)), 1 - w], ["Prone_Fire", 0.5, w]]; S.man.R = u > 0.7 ? "grip" : null; S.man.L = u > 0.8 ? "bag" : null; S.cam = { kind: "follow", off: [2.6, 1.0, 0.2], look: [0, 0.3, 0.6] }; });
  const prone0 = S => { ready(S); pronePose(S); shootingHands(S); };
  B(6, "s06.bag", (S, u) => { prone0(S); S.cam = { kind: "rifle", pos: [-0.42, -0.02, -0.62], look: [-0.03, -0.16, -0.06], near: true, fov: 40 }; });   // from the left, from the muzzle side
  B(6, "s06.cheek", (S, u) => { prone0(S); S.cam = { kind: "follow", off: [0.9, 0.45, -0.9], look: [0, 0.3, 0.6] }; });
  // 7 "Ładuj!": magazine from the pouch into the rifle, round chambered, still on safe
  cmd(7, "s07.cmd", S => prone0(S));
  B(7, "s07.mag", (S, u) => { prone0(S); S.props.roundsInMag = 3; S.man.R = u < 0.55 ? "magwell" : "grip"; S.props.mag = u < 0.55 ? "well" : null; S.rifle.magIn = u >= 0.55;
    S.cam = { kind: "rifle", pos: [0.4, -0.12, -0.3], look: [0, -0.1, -0.47], fov: 36 }; });
  B(7, "s07.chamber", (S, u) => { prone0(S); S.rifle.magIn = true; S.rifle.boltOpen = u < 0.4; S.man.L = u < 0.5 ? "boltcatch" : "bag"; S.cam = { kind: "rifle", pos: [-0.38, 0.05, -0.36], look: [0, -0.03, -0.44], fov: 34 }; });
  const prone = S => { prone0(S); S.rifle.magIn = true; S.rifle.boltOpen = false; };
  // 8 target designation (no distance) and search
  cmd(8, "s08.cmd", S => prone(S));
  B(8, "s08.target", (S, u) => { prone(S); S.cam = { kind: "follow", off: [1.0, 0.55, -1.2], look: [0, 0.35, 3.0] }; });
  const scan = u => { const strips = [[-28, -90, 90], [-12, 90, -90], [-3, -90, 0]], k = Math.min(2.999, u * 3), i = Math.floor(k), f = ease(k - i), s = strips[i]; return { pitch: s[0], yaw: lerp(s[1], s[2], f) }; };
  B(8, "s08.scan", (S, u) => { prone(S); scopeCam(S, { mag: 3, ...scan(u * 0.45) }); });
  B(8, "s08.strips", (S, u) => { prone(S); scopeCam(S, { mag: 3, ...scan(0.45 + u * 0.5) }); });
  B(8, "s08.found", (S, u) => { prone(S); const s = scan(0.95 + u * 0.05); scopeCam(S, { mag: lerp(3, 12, ease(seg(u, 0.35, 0.9))), yaw: s.yaw * (1 - ease(u)), pitch: s.pitch * (1 - ease(u)) }); });
  // 9 mil-dot measurement
  const NB = ["Gong czerwony, tułów 0,5 × 1,0 m", "Wys. 1,6 mil", "Szer. 0,8 mil"];
  B(9, "s09.why", (S, u) => { prone(S); scopeCam(S, { mag: 12, breath: 0.15 }); });
  B(9, "s09.height", (S, u) => { prone(S); scopeCam(S, { mag: 12, breath: 0.1, pitch: -lerp(0, 0.8, ease(seg(u, 0.1, 0.5))), measure: u > 0.5 ? "h" : null }); });
  B(9, "s09.width", (S, u) => { prone(S); scopeCam(S, { mag: 12, breath: 0.1, yaw: -lerp(0, 0.4, ease(seg(u, 0.1, 0.5))), measure: u > 0.5 ? "w" : null }); });
  const writing = S => { prone(S); S.man.R = "write"; S.man.L = "notebook"; S.props.notebook = "ground"; S.man.look = "notebook"; };
  B(9, "s09.note", (S, u) => { writing(S); S.cam = { kind: "follow", off: [0.9, 0.7, 0.3], look: [0.25, 0.1, 0.9] }; S.ov.note = card("62%", "12%", "330px", reveal(NB, u)); });
  // 10 wind
  B(10, "s10.look", (S, u) => { prone(S); const k = ease(seg(u, 0.35, 0.6));
    S.cam = { kind: "world", pos: W(-2.2, -3.2, 1.0), look: W(40, 14, 1.0), focus: W(1.5, -1.8, 0.15).lerp(W(42, 15, 3), k), focusExact: true, aperture: 0.0035 * (1 - k) }; S.ov.windLook = [`Trawa pochyla się w prawo · liście w ciągłym ruchu<br><b>wiatr z lewej, 2–4 m/s</b>`, "left:50%;transform:translateX(-50%);top:10%;background:rgba(0,0,0,.7);color:#fff;padding:8px 14px;border-radius:6px;font:18px system-ui;text-align:center"]; });
  const KES = `<div style="background:#1a1c18;border-radius:14px;padding:12px;width:230px"><div style="background:#a9b8a0;color:#111;border-radius:6px;padding:10px 12px;font:16px/1.5 monospace">
    <div style="display:flex;justify-content:space-between"><b>WIND</b><span>3.0 m/s</span></div><div style="display:flex;justify-content:space-between"><b>DIR</b><span>z godz. 9</span></div>
    <div style="display:flex;justify-content:space-between"><b>TEMP</b><span>8.0 °C</span></div><div style="display:flex;justify-content:space-between"><b>BARO</b><span>1005 hPa</span></div>
    <div style="display:flex;justify-content:space-between"><b>RH</b><span>80 %</span></div></div><div style="color:#bbb;text-align:center;font:12px system-ui;margin-top:6px">Kestrel 5700</div></div>`;
  // Kestrel: raised into the wind, the vane wheel spins up, then lowered in front of the face and read
  B(10, "s10.kestrel", (S, u, b) => { prone(S); S.props.kestrel = "hand"; S.man.look = "kestrel";
    // the left hand measures (author, 18 XI); the right hand stays on the grip
    S.man.R = "grip"; S.man.L = u < 0.25 ? { from: "bag", to: "kestrelUp", k: ease(seg(u, 0, 0.25)) } : "kestrelUp";
    const t = S.tInBeat - b.dur * 0.25; S.props.spin = t > 0 ? 18 * t * Math.min(1, t / 1.5) : 0;
    S.cam = u < 0.5 ? { kind: "follow", off: [-1.1, 0.9, 1.6], look: [0.2, 0.55, 0.5] } : { kind: "prop", dist: 0.32 }; });   // close-up: the impeller spinning
  B(10, "s10.reading", (S, u, b) => { prone(S); S.props.kestrel = "hand"; S.man.look = "kestrel";
    S.man.R = "grip"; S.man.L = u < 0.3 ? { from: "kestrelUp", to: "kestrelRead", k: ease(seg(u, 0, 0.3)) } : "kestrelRead";
    const t = S.tInBeat; S.props.spin = 1000 + 18 * t * Math.max(0, 1 - t / 4);
    S.cam = { kind: "follow", off: [-0.8, 0.75, 1.15], look: [0.15, 0.35, 0.65] }; if (u > 0.3) S.ov.kes = [KES, "right:6%;top:14%"]; });
  // after the reading the Kestrel lies on the ground beside the shooter, display up, showing the wind in m/s
  B(10, "s10.note", (S, u) => { writing(S); S.props.kestrel = "ground";
    S.cam = u < 0.45 ? { kind: "kestrelGround" } : { kind: "follow", off: [0.9, 0.7, 0.3], look: [0.25, 0.1, 0.9] };
    if (u >= 0.45) S.ov.note = card("62%", "12%", "330px", reveal([...NB, "Wiatr 3,0 m/s z godz. 9", "Trawa w prawo, liście w ruchu"], 0.6 + seg(u, 0.45, 1) * 0.4)); });
  // 11 distance from the formula
  const F = ["odległość = wymiar celu [m] × 1000 / odczyt [mil]", "wysokość: 1,0 × 1000 / 1,6 = <b>625 m</b>", "szerokość: 0,5 × 1000 / 0,8 = <b>625 m</b>"];
  const formula = u => [`<div style="font:600 15px system-ui;color:#f2c94c;margin-bottom:8px">Odległość z siatki mil-dot</div><div style="font:22px/1.7 system-ui">${reveal(F, u)}</div>`, "left:50%;transform:translateX(-50%);top:16%;background:rgba(0,0,0,.8);color:#fff;padding:16px 26px;border-radius:8px;min-width:560px"];
  for (const [k, f] of [["s11.formula", 0.34], ["s11.height", 0.67], ["s11.width", 1]]) B(11, k, (S, u) => { writing(S); S.cam = { kind: "follow", off: [0.9, 0.7, 0.3], look: [0.25, 0.1, 0.9] }; S.ov.f = formula(f); });
  // 12 range card
  const rangeCard = u => {
    const k = n => u >= n / 6;
    const arcs = [];
    for (let d = 100; d <= 1000; d += 100) { const r = d / 1000 * 190; arcs.push(`<path d="M ${200 - r} 210 A ${r} ${r} 0 0 1 ${200 + r} 210" fill="none" stroke="#7a8496" stroke-width="${d % 500 ? 0.8 : 1.6}"/>`); if (d % 200 === 0) arcs.push(`<text x="${200 + r - 3}" y="224" font-size="10" fill="#555" text-anchor="middle">${d}</text>`); }
    const tr = RANGE / 1000 * 190;
    const svg = `<svg width="400" height="232"><line x1="200" y1="210" x2="${200 - 190 * Math.sin(0.5)}" y2="${210 - 190 * Math.cos(0.5)}" stroke="#333" stroke-width="1.5"/><line x1="200" y1="210" x2="${200 + 190 * Math.sin(0.5)}" y2="${210 - 190 * Math.cos(0.5)}" stroke="#333" stroke-width="1.5"/>${arcs.join("")}
      <polygon points="200,203 194,214 206,214" fill="#1d2a40"/>${k(1) ? `<circle cx="200" cy="${210 - tr}" r="7" fill="#c0242a"/><text x="212" y="${214 - tr}" font-size="14" fill="#c0242a">1</text>` : ""}</svg>`;
    const rows = [["Cel nr 1", "gong czerwony, tułów 0,5 × 1,0 m"], ["Kierunek", "55° (978 mils) · godz. 12"], ["Odległość", "625 m"], ["Warunki", "8 °C · 1005 hPa · RH 80 % · wiatr 3,0 m/s z godz. 9"], ["Godzina / słońce", "13:00 · słońce z tyłu po prawej"], ["Nastawy", "wysokość 6,5 mrad ↑ · wiatr 1,6 mrad ←"]];
    const tbl = rows.map(([a, b], i) => `<tr><td style="color:#666;padding-right:10px">${a}</td><td>${k(i + 1) ? b : ""}</td></tr>`).join("");
    return [`<div style="font:700 15px system-ui;color:#1d2a40;margin-bottom:4px">KARTA OGNIA · stanowisko Kijewo</div>${svg}<table style="font:16px/1.5 'Segoe Print','Comic Sans MS',cursive;color:#1d2a40">${tbl}</table>`,
      "right:4%;top:6%;background:#f4f1e8;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.5);padding:12px 16px"];
  };
  const cardBeat = (key, a, b) => B(12, key, (S, u) => { writing(S); S.cam = { kind: "follow", off: [1.3, 0.8, -0.2], look: [0.2, 0.1, 0.7] }; S.ov.card = rangeCard(lerp(a, b, u)); });
  cardBeat("s12.card", 0, 1 / 6); cardBeat("s12.target", 1 / 6, 3 / 6); cardBeat("s12.weather", 3 / 6, 4 / 6); cardBeat("s12.sun", 4 / 6, 5 / 6); cardBeat("s12.dope", 5 / 6, 1);
  // 13 dial in
  B(13, "s13.parallax", (S, u) => { prone(S); S.man.L = "parallax"; S.rifle.parallax = lerp(300, 600, ease(seg(u, 0.1, 0.6)));
    scopeCam(S, { mag: 12, blur: Math.abs(S.rifle.parallax - 600) / 120, wobble: u > 0.65 ? Math.sin((u - 0.65) * 40) * 0.25 : 0 }); });
  B(13, "s13.elev", (S, u) => { prone(S); S.rifle.parallax = 600; S.man.R = "elev"; S.rifle.elev = lerp(0, ELEV, ease(seg(u, 0.15, 0.8))); S.cam = { kind: "rifle", pos: [0.05, 0.42, -0.36], look: [0, 0.13, -0.405] };
    S.ov.dial = turretDialAt("6%", "18%", "Bęben wysokości (↑)", S.rifle.elev, 0, 12, "mrad"); });
  B(13, "s13.wind", (S, u) => { prone(S); S.rifle.parallax = 600; S.rifle.elev = ELEV; S.man.R = "windage"; S.rifle.wind = lerp(0, WIND, ease(seg(u, 0.1, 0.55))); S.cam = u < 0.6 ? { kind: "rifle", pos: [0.32, 0.2, -0.3], look: [0.03, 0.086, -0.405] } : null;
    if (u < 0.6) S.ov.dial = turretDialAt("6%", "18%", "Bęben poprawek bocznych", -S.rifle.wind, -6, 12, "mrad"); else scopeCam(S, { mag: 12 }); });
  const dialled = S => { prone(S); S.rifle.elev = ELEV; S.rifle.wind = WIND; S.rifle.parallax = 600; };
  // 14 "Ognia!": safety off
  cmd(14, "s14.cmd", S => dialled(S));
  // the safety is worked by the right thumb (author, 18 XI): thumb to the lever, lever turned, thumb back on the grip
  const thumbSafety = (S, u, from, to) => { S.man.thumbK = ease(seg(u, 0.08, 0.32)) * (1 - ease(seg(u, 0.62, 0.86)));
    const k = ease(seg(u, 0.36, 0.56)); S.rifle.selK = from === "Z" ? k : 1 - k; S.rifle.safety = k > 0.5 ? to : from; };
  B(14, "s14.safety", (S, u) => { dialled(S); thumbSafety(S, u, "Z", "P"); S.cam = { kind: "rifle", pos: [-0.26, 0.0, -0.30], look: [0.0, -0.05, -0.34], fov: 36 }; S.ov.sel = SAFE_OV(S); });
  // 15 first shot
  const live = S => { dialled(S); S.rifle.safety = "P"; };
  const SHOOT_MAG = 9;                                              // measure at 12x, shoot at a lower power (wider view, steadier picture)
  B(15, "s15.breath", (S, u) => { live(S); scopeCam(S, { mag: lerp(12, SHOOT_MAG, ease(seg(u, 0.0, 0.18))), breath: lerp(0.9, 0.06, ease(seg(u, 0.15, 0.85))), breathT: lerp(3.6, 6, u) }); });
  B(15, "s15.trigger", (S, u) => { live(S); S.man.trigger = true; if (u < 0.45) S.cam = { kind: "rifle", pos: [0.30, -0.12, -0.44], look: [0.0, -0.07, -0.33], fov: 30 }; else scopeCam(S, { mag: SHOOT_MAG, breath: 0.05 }); });
  // first shot: 0.85 s after the shot the view cuts to the gong and the bullet clock slows down 10x until 0.4 s after the hit
  const SLOW = { from: 0.85, factor: 0.1, until: 1.113 + 0.4 }, SLOW_LEN = (SLOW.until - SLOW.from) / SLOW.factor;
  B(15, "s15.flight", (S, u, b) => { live(S); const t = S.tInBeat - 0.25;
    if (t < SLOW.from || t > SLOW.from + SLOW_LEN) scopeCam(S, { mag: SHOOT_MAG, breath: 0.05 }); else { S.cam = { kind: "gong" }; S.ov.slow = SLOW_OV; S.ov.arc = arcOverlay(rangeAtTime(bt(SHOTS[0], S.T))); } }, { dur: 0.25 + SLOW.from + SLOW_LEN + 1.6 });
  B(15, "s15.hit", (S, u) => { live(S); scopeCam(S, { mag: SHOOT_MAG, breath: 0.05 }); });
  // replay of the action cycling, 10x slow, seen through the ejection port: carrier back, case out to the right, carrier home
  B(15, "s15.cycle", (S, u) => { live(S); const t = S.tInBeat - 0.6; if (t > 0) S.cycleT = Math.min(0.45, t / 10); if (t > 0 && t < 4.6) S.ov.slow = SLOW_OV;
    S.cam = { kind: "rifle", pos: [0.22, 0.26, -0.72], look: [0.03, 0, -0.44], fov: 38 }; }, { dur: 8.5 });
  // 16 shots 2 and 3
  B(16, "s16.repeat", (S, u, b) => { live(S); const t = S.tInBeat; scopeCam(S, { mag: SHOOT_MAG, breath: (t > 1.5 && t < 3.0) || (t > 9 && t < 10.5) ? 0.05 : 0.35 }); }, { dur: 15 });
  B(16, "s16.weld", (S, u) => { live(S); S.cam = { kind: "head", who: "man" }; });   // cheek on the stock, eye at the eyepiece
  B(16, "s16.group", (S, u) => { live(S); S.cam = { kind: "gongClose" }; });
  B(16, "s16.empty", (S, u) => { live(S); S.rifle.boltOpen = true; S.cam = { kind: "rifle", pos: [0.42, 0.12, -0.45], look: [0.02, 0, -0.45] }; });
  // 17 "Przerwij ogień!", "Rozładuj!"
  const empty = S => { dialled(S); S.rifle.boltOpen = true; S.rifle.safety = "Z"; };
  cmd(17, "s17.cmd", S => { empty(S); S.rifle.safety = "P"; });
  B(17, "s17.safe", (S, u) => { empty(S); thumbSafety(S, u, "P", "Z"); S.cam = { kind: "rifle", pos: [-0.26, 0.0, -0.30], look: [0.0, -0.05, -0.34], fov: 36 }; S.ov.sel = SAFE_OV(S); });
  cmd(17, "s17.cmd2", S => empty(S));
  B(17, "s17.unload", (S, u) => { empty(S); S.rifle.magIn = u < 0.4; S.props.mag = u >= 0.4 ? "inspect" : null; S.props.roundsInMag = 0; S.man.R = u < 0.4 ? "magwell" : "maginspect"; S.man.look = u < 0.4 ? "port" : "mag";
    S.cam = { kind: "follow", off: [1.1, 0.6, 0.4], look: [0, 0.25, 0.9] }; });
  const unloaded = S => { empty(S); S.rifle.magIn = false; S.props.mag = "ground"; S.props.roundsInMag = 0; };
  B(17, "s17.finger", (S, u) => { unloaded(S); S.man.R = "chamber"; S.man.curl.R = 0.45; S.man.look = "port"; S.cam = { kind: "rifle", pos: [0.34, 0.1, -0.33], look: [0.03, 0, -0.44], fov: 30 }; });
  // 18 "Do przejrzenia broń!": the instructor checks; "Powstań!"; back to the start line
  cmd(18, "s18.cmd", S => unloaded(S));
  const INSPECT = RL(V(0.55, 0, -0.42)).setY(0), INSPECT_YAW = yawOf(RL(V(0, 0, -0.43)).sub(INSPECT).setY(0));
  // the instructor walks to the right side of the rifle, kneels, bends over the ejection port and checks it; he says
  // "Sprawdziłem!" still kneeling and gets up during the next sentence
  // the instructor goes round behind the shooter's feet to the right side of the rifle: never over him, never in front
  // of the muzzle (author, 18 XI)
  const INSPECT_ROUTE = [INST, W(-1.8, 2.3), W(-3.5, 1.5), W(-3.5, -1.2), W(-0.9, -1.0), g(INSPECT.clone())];   // well behind the feet
  function routeAt(pts, k) {
    const seg = pts.slice(1).map((p, i) => p.distanceTo(pts[i])), total = seg.reduce((a, b) => a + b, 0);
    let d = k * total, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const a = pts[i], b = pts[i + 1], at = a.clone().lerp(b, Math.min(1, d / seg[i]));
    return { at, yaw: yawOf(b.clone().sub(a).setY(0)), dist: k * total };
  }
  const instKneel = (S, k, lean, look) => { S.inst.at = g(INSPECT.clone()); S.inst.yaw = INSPECT_YAW; S.inst.clips = [["Kneel_on_One_Knee_and_Stand", lerp(1.9, 0, k), 1]]; S.inst.lean = lean; S.inst.look = look; };
  B(18, "s18.inspect", (S, u) => { unloaded(S); S.man.R = null;
    const k1 = ease(seg(u, 0, 0.35)), k2 = ease(seg(u, 0.35, 0.5));
    if (k1 < 1) { const p = routeAt(INSPECT_ROUTE, k1); S.inst.at = p.at; S.inst.yaw = p.yaw; S.inst.clips = [["Walking", 0, 1]]; S.inst.walk = p.dist; }
    else instKneel(S, k2, 0.75 * k2, u > 0.5 ? "port" : "shooter");
    S.cam = u < 0.35 ? { kind: "world", pos: W(-3.0, -2.6, 1.4), look: W(-0.4, 0.4, 0.5), fov: 40 } : { kind: "world", pos: RL(V(1.7, 0.8, -2.2)), look: RL(V(0.35, 0.25, -0.45)), fov: 42 }; });
  B(18, "s18.checked", (S, u) => { unloaded(S); S.man.R = null; instKneel(S, 1, 0.3, "shooter"); S.inst.speak = true;
    S.cam = { kind: "world", pos: RL(V(1.9, 0.9, -1.6)), look: RL(V(0.55, 0.55, -0.42)), fov: 38 }; });
  B(18, "s18.rule", (S, u) => { unloaded(S); S.man.R = null; instKneel(S, 1 - ease(seg(u, 0, 0.35)), 0.3 * (1 - ease(seg(u, 0, 0.35))), "shooter");
    S.cam = { kind: "world", pos: W(-3.0, -2.6, 1.3), look: W(-0.5, 0.3, 0.4), fov: 42 }; });
  B(18, "s18.log", (S, u) => { unloaded(S); writing(S); S.rifle.boltOpen = true; S.rifle.magIn = false; S.cam = { kind: "follow", off: [-0.85, 0.75, 0.55], look: [-0.1, 0.1, 0.9] };   // from the left: the instructor kneels on the right
    S.ov.note = card("62%", "12%", "330px", reveal([...NB, "Wiatr 3,0 m/s z godz. 9", "625 m · 6,5 ↑ · 1,6 ←", "Strzały: 3 · trafienia: 3", "Skupienie ok. 20 cm, środek celu"], 0.55 + u * 0.45)); });
  cmd(18, "s18.cmd2", S => unloaded(S));
  B(18, "s18.stand", (S, u) => { unloaded(S); const k = ease(seg(u, 0, 0.6)); S.man.R = null; S.man.L = null;
    S.man.at = PRONE.clone().lerp(KNEEL, k); S.man.yaw = lerp(yawFwd, KNEEL_YAW, k);
    // Meshy "stand up from prone", then standing
    const w0 = ease(seg(u, 0, 0.08)), w1 = ease(seg(u, 0.58, 0.68));
    S.man.clips = [["Prone_Fire", 0.5, 1 - w0], ["Prone_Stand_Up", 2.95 * seg(u, 0.05, 0.6), w0 * (1 - w1)], ["Idle", 2, w1]];
    S.rifle.capF = S.rifle.capR = 1 - seg(u, 0.55, 0.7);              // flip-up caps closed before the rifle is picked up (not narrated)
    if (u > 0.75) { S.rifle.mode = "carry"; S.rifle.blend = 1 - ease(seg(u, 0.75, 1)); S.man.R = "grip"; }
    S.cam = { kind: "world", pos: W(-4.5, -3.0, 1.8), look: W(-0.6, 0.2, 0.5), fov: 45 }; }, { dur: 9 });
  const slung = S => { unloaded(S); S.rifle.mode = "sling"; S.rifle.capF = S.rifle.capR = "pouch"; S.man.R = "grip"; S.man.L = null; };
  cmd(18, "s18.cmd3", S => { slung(S); S.man.at = KNEEL.clone(); S.man.yaw = KNEEL_YAW; S.man.clips = [["Idle", 0, 1]]; });
  B(18, "s18.back", (S, u) => { slung(S); walkTo(S, KNEEL, LINE, ease(u)); S.man.walk = ease(u) * KNEEL.distanceTo(LINE); S.man.clips = [["Walking", 0, 1]];
    S.cam = { kind: "world", pos: W(-4.5, -4.0, 1.9), look: W(-8, 1.5, 0.9), fov: 45 }; }, { dur: 12 });

  function shotAt(S, n, t0) { if (!S.shots.find(s => s.n === n)) S.shots.push({ n, t0 }); }
  // shots fired in earlier beats stay in the state (the beats above only add their own); collect all fired shots up to T
  const SHOT_BEATS = beats.filter(b => /s15\.flight|s16\.repeat/.test(b.say));

  const tl = new Timeline({ beats, manifest, audioDir: "demo/audio/scene1", audioQuery: "?v=" + Date.now(), init, sceneTitles: SCENES });
  tl.beforeBeat = S => { S.man.kneelHinge = false; S.ov = {}; S.cam = null; S.scope = null; S.man.look = null; S.man.trigger = false; S.man.thumbK = 0; S.rifle.selK = undefined; S.man.curl = { R: 0.8, L: 0.3 }; S.props.kestrel = null; S.props.notebook = null; S.cycleT = null; S.man.lean = 0; S.inst.lean = 0; };   // hand-held props and the slow replay belong to their beat
  // absolute shot times (needed by beats after the shots: marks, swing, bolt)
  const SHOTS = [{ n: 0, t0: SHOT_BEATS[0].start + 0.25, slow: SLOW }, { n: 1, t0: SHOT_BEATS[1].start + 3.0 }, { n: 2, t0: SHOT_BEATS[1].start + 10.5 }];
  const TOF = BAL.tof, SOUND_BACK = RANGE / SOUND;
  // bullet clock of a shot at timeline time T (slow motion for the first shot's gong insert)
  function bt(sh, T) { const t = T - sh.t0, w = sh.slow; if (!w || t < w.from) return t; const len = (w.until - w.from) / w.factor;
    return t < w.from + len ? w.from + (t - w.from) * w.factor : w.until + (t - w.from - len); }

  // ---------- ballistics: point of the trajectory at range d for shot n (world), relative to the LOS ----------
  const rows = BAL.rows;
  const losDir = GC.clone().sub(RL(EYE)).normalize(), losRight = losDir.clone().cross(up).normalize(), losUp = losRight.clone().cross(losDir).normalize();
  function pathAt(d, n) {
    let i = rows.findIndex(r => r[0] >= d); if (i < 1) i = 1; const a = rows[i - 1], b = rows[i], f = (d - a[0]) / Math.max(1e-6, b[0] - a[0]);
    const h = a[2] + (b[2] - a[2]) * f + ELEV * d / 1000 + DISP[n][1] * d / 1000, w = a[3] + (b[3] - a[3]) * f - WIND * d / 1000 + DISP[n][0] * d / 1000;
    return RL(EYE).addScaledVector(losDir, d).addScaledVector(losUp, h).addScaledVector(losRight, w);
  }
  function rangeAtTime(t) { let i = rows.findIndex(r => r[1] >= t); if (i < 1) i = 1; const a = rows[i - 1], b = rows[i]; return a[0] + (b[0] - a[0]) * (t - a[1]) / Math.max(1e-6, b[1] - a[1]); }
  // side profile of the trajectory with the dialled elevation: line of sight, bullet path, highest point, hit at 625 m;
  // the vertical scale is stretched (true proportions would show a flat line)
  const ARC = (() => { const pts = rows.filter(r => r[0] <= RANGE + 0.1).map(r => [r[0], r[2] + ELEV * r[0] / 1000]); let top = pts[0]; for (const p of pts) if (p[1] > top[1]) top = p; return { pts, top }; })();
  function arcOverlay(dNow) {
    const Wd = 520, Hd = 190, x0 = 28, y0 = 120, sx = (Wd - 60) / RANGE, sy = 60;   // px per metre: 0.74 horizontal, 60 vertical (~80x)
    const X = d => x0 + d * sx, Y = h => y0 - h * sy;
    const path = ARC.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
    const cur = ARC.pts.reduce((a, p) => Math.abs(p[0] - dNow) < Math.abs(a[0] - dNow) ? p : a, ARC.pts[0]);
    const fmt = v => v.toFixed(2).replace(".", ",");
    return [`<div style="font:600 14px system-ui;color:#f2c94c;margin-bottom:4px">Tor pocisku z boku · skala pionowa powiększona ok. 80×</div>
      <svg width="${Wd}" height="${Hd}" style="display:block">
        <line x1="${X(0)}" y1="${Y(0)}" x2="${X(RANGE)}" y2="${Y(0)}" stroke="#9ec3ff" stroke-width="1.5" stroke-dasharray="6 4"/>
        <text x="${X(0) + 4}" y="${Y(0) - 6}" fill="#9ec3ff" font-size="12" font-family="system-ui">linia celowania</text>
        <path d="${path}" fill="none" stroke="#ff8a1e" stroke-width="2.5"/>
        <circle cx="${X(ARC.top[0])}" cy="${Y(ARC.top[1])}" r="3" fill="#ff8a1e"/>
        <text x="${X(ARC.top[0]) - 70}" y="${Y(ARC.top[1]) - 8}" fill="#fff" font-size="12" font-family="system-ui">najwyżej ${fmt(ARC.top[1])} m nad linią celowania, na ${Math.round(ARC.top[0])} m</text>
        <text x="${X(0) + 2}" y="${Y(-0.0857) + 16}" fill="#ccc" font-size="11" font-family="system-ui">wylot lufy 8,6 cm pod linią celowania</text>
        <rect x="${X(RANGE) - 4}" y="${Y(0.5)}" width="8" height="${sy}" fill="#c0242a"/>
        <text x="${X(RANGE) - 56}" y="${Y(0) + 46}" fill="#fff" font-size="12" font-family="system-ui">gong, 625 m</text>
        <circle cx="${X(cur[0])}" cy="${Y(cur[1])}" r="5" fill="#fff" stroke="#ff8a1e" stroke-width="2"/>
      </svg>`, "left:3%;bottom:150px;background:rgba(0,0,0,.72);padding:10px 14px;border-radius:8px"];
  }
  const impact = n => { const p = pathAt(RANGE, n), loc = pivot.worldToLocal(p.clone()); return [-loc.x, loc.y - (-0.82)]; };   // plate coords (x right from the shooter's view, y up)

  // ---------- render one evaluated state ----------
  const panel = makePanel(tl, { title: TITLE, onToggleLabels: on => { labelsOn = on; }, onCamMode: m => { freeCam = m === "free"; fpp = m === "fpp"; controls.enabled = freeCam; if (freeCam) { controls.target.copy(man.m.position).add(V(0, 0.6, 0)); } } });
  let labelsOn = false, freeCam = false, fpp = false;
  // first person (author, 18 XI): the camera in the shooter's eyes, turning smoothly to what he is doing; the script's
  // scope shots are kept, every other shot is replaced by the eye view
  const fppDir = V(0, 0, 1); let fppT = performance.now(), fppInit = false;
  function fppTarget(S) {
    if (S.man.look && lookTargets[S.man.look]) return lookTargets[S.man.look]();
    if (S.props.kestrel && S.props.kestrel !== "ground") return kestrel.getWorldPosition(V());
    const busy = h => h && h !== "grip" && h !== "bag" && h !== "handguard";
    if (busy(S.man.R)) return handsMan.handPoint("R", 0, 0.1, 0);
    if (busy(S.man.L)) return handsMan.handPoint("L", 0, 0.1, 0);
    if (S.rifle.mode === "ground" && clipsList_.some(c => c[0] === "Prone_Fire" && c[2] > 0.5)) return GC.clone();
    return man.m.localToWorld(V(0, 1.4, 12));                     // walking / kneeling: straight ahead
  }
  function fppCamera(S) {
    const hf = man.m.getObjectByName("headfront"), head = man.rig.B.Head.getWorldPosition(V()), fr = hf ? hf.getWorldPosition(V()) : head.clone().add(V(0, 0.05, 0));
    const proneNow = clipsList_.some(c => c[0] === "Prone_Fire" && c[2] > 0.5) && S.rifle.mode === "ground";
    const fwd = fr.clone().sub(head).setY(0).normalize(), eye = proneNow ? fr.clone().add(V(0, 0.075, 0)).addScaledVector(fwd, 0.02)   // prone: just over the scope, not into the eyepiece
      : fr.clone().addScaledVector(fwd, 0.12).add(V(0, 0.02, 0));   // just in front of the face: the hood stays out of the view
    const want = fppTarget(S).sub(eye).normalize(), now = performance.now(), k = 1 - Math.exp(-(now - fppT) / 1000 * 3.5); fppT = now;
    if (!fppInit) { fppDir.copy(want); fppInit = true; } else fppDir.lerp(want, k).normalize();
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.clone().add(fppDir)); camera.fov = 62; camera.updateProjectionMatrix();
  }
  let clipsList_ = [];
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  const controls = new OrbitControls(camera, ctx.renderer.domElement); controls.enabled = false; controls.enableDamping = true;
  // free camera keys (author, 18 XI): W/S forward and back, A/D sideways, Q/E down and up, Shift faster; the orbit
  // centre moves with the camera
  const keys = new Set(); let keyT = performance.now();
  addEventListener("keydown", e => { if (freeCam && /^[wsadqe]$/i.test(e.key)) { keys.add(e.key.toLowerCase()); e.preventDefault(); } if (e.key === "Shift") keys.add("shift"); });
  addEventListener("keyup", e => { keys.delete(e.key.toLowerCase()); if (e.key === "Shift") keys.delete("shift"); });
  addEventListener("blur", () => keys.clear());
  const freeMove = () => { const now = performance.now(), dt = Math.min(0.1, (now - keyT) / 1000); keyT = now; if (!keys.size) return;
    const sp = (keys.has("shift") ? 12 : 3) * dt, f = camera.getWorldDirection(V()).setY(0).normalize(), r = V(-f.z, 0, f.x), m = V();
    if (keys.has("w")) m.add(f); if (keys.has("s")) m.sub(f); if (keys.has("d")) m.add(r); if (keys.has("a")) m.sub(r);
    if (keys.has("e")) m.y += 1; if (keys.has("q")) m.y -= 1;
    if (m.lengthSq()) { m.normalize().multiplyScalar(sp); camera.position.add(m); controls.target.add(m); } };
  const [{ EffectComposer }, { RenderPass }, { BokehPass }, { OutputPass }] = await Promise.all(["EffectComposer", "RenderPass", "BokehPass", "OutputPass"].map(n => import(`three/addons/postprocessing/${n}.js`)));
  const composer = new EffectComposer(ctx.renderer); composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.004, maxblur: 0.012 }); composer.addPass(bokeh); composer.addPass(new OutputPass());
  // far-side blur only, and never within 50 m of the camera (author, 18 XI): the shader's |depth - focus| becomes
  // min(max(focus, 50 m) - depth, 0) (viewZ is negative depth)
  { const m = bokeh.materialBokeh, src = m.fragmentShader;
    m.fragmentShader = src.replace(/float factor = \( focus \+ viewZ \);/, "float factor = min( max( focus, 50.0 ) + viewZ, 0.0 );"); m.needsUpdate = true;
    if (m.fragmentShader === src) console.warn("bokeh patch not applied"); }
  addEventListener("resize", () => composer.setSize(innerWidth, innerHeight));
  window.__renderOverride = () => {                              // __dbgCam: test hook, a fixed camera for close-up checks
    const dc = window.__dbgCam; if (dc) { camera.position.copy(dc.p); camera.lookAt(dc.t); camera.fov = dc.fov || 40; camera.updateProjectionMatrix(); }
    const hide = dc && dc.noBody ? [] : null; if (hide) man.m.traverse(o => { if (o.isSkinnedMesh && o.visible) { o.visible = false; hide.push(o); } });
    composer.render(); if (hide) hide.forEach(o => o.visible = true); };
  const canvas = ctx.renderer.domElement;
  let scopeOv = null, lastMag = -1;
  const grass = scene.children.find(o => o.isInstancedMesh && o.count > 1000);

  const camFov = S => S.cam && S.cam.kind === "scope" ? scopeGeom(S.scope.mag).vfov : 45;   // the tracer keeps the same apparent width
  function placeSoldier(sd, at, yaw, clipsList) { sd.m.position.copy(at); sd.m.rotation.set(0, yaw, 0); sd.pose(clipsList); }

  function rifleMatrix(S) {
    if (S.rifle.mode === "ground") return { p: pGround.clone(), q: qGround.clone() };
    man.rig.B.Spine2.updateMatrixWorld(true);
    const m = man.rig.B.Spine2.matrixWorld.clone().multiply(slungInSpine), p = V(), q = new THREE.Quaternion(), s = V(); m.decompose(p, q, s);
    if (S.rifle.mode === "sling") return { p, q };
    const k = S.rifle.blend, pp = p.clone().lerp(pGround, k).add(V(0, Math.sin(Math.PI * Math.min(1, k)) * 0.25, 0));
    return { p: pp, q: q.clone().slerp(qGround, k) };
  }
  // per hold: rifle-local hand orientation (Euler YXZ) and finger joint angles. The turret holds were fitted numerically
  // (18 XI): index pad and thumb on opposite sides of the cap, no finger inside the cap or the scope, joints within
  // their natural range
  // (refitted 18 XI with the wrist kept within ~30 degrees of the forearm: it was bent up too far)
  const kesPinch = () => { const L_ = curS && curS.man.L, key = typeof L_ === "string" ? L_ : L_ && L_.to; return /kestrel/.test(key || "") && curS.props.kestrel && curS.props.kestrel !== "ground"; };
  let curS = null;
  const HAND_ORIENT = { elev: [-1.076, -1.79, -4.045], windage: [-1.007, 0.472, -0.093] };
  const FINGER_POSE = {
    elev: { indexA: [0.98, 0.926, 0.328], gripA: [1.44, 0.564, 0.793], thumbA: [0.575, 0.604, 1.255], thumbUp: 0.213 },
    windage: { indexA: [1.212, 0.739, 0.034], gripA: [0.985, 0.748, 0.024], thumbA: [0.635, 0.529, 0.678], thumbUp: -0.684 } };   // wrist low, beside the turret
  // the pinching hand turns with the cap, letting go and taking a new hold every ~40 degrees
  const TURRET_AX = { elev: { p: V(0, 0.121, -0.405), a: V(0, 1, 0), ang: S => S.rifle.elev / 10 * Math.PI * 2 },
    windage: { p: V(0.031, 0.086, -0.405), a: V(1, 0, 0), ang: S => -S.rifle.wind / 10 * Math.PI * 2 } };
  const twistOf = (key, S) => { const t = TURRET_AX[key]; if (!t) return 0; const SEG = 0.7, a = t.ang(S), n = a / SEG, f = n - Math.floor(n);
    return SEG * (f < 0.85 ? f / 0.85 : (1 - f) / 0.15) - SEG / 2; };
  const GRIP_TUNE = { pitch: 0.2, roll: 0 };   // wrist high and hand flat: the index finger reaches the trigger in its own axis
  const HANDS = {   // rifle-local wrist and knuckle targets
    grip: [[0.033, -0.05, -0.255], [-0.022, -0.106, -0.36]], handguard: [[-0.035, -0.07, -0.66], [0.02, -0.05, -0.74]],
    bipod: [[-0.06, -0.12, -0.80], [0.0, -0.2, -0.86]], charging: [[0.075, 0.02, -0.52], [0.045, 0.02, -0.57]],
    chamber: [[0.10, 0.03, -0.38], [0.025, 0.0, -0.45]], capF: [[0.07, 0.03, -0.53], [0.01, 0.05, -0.595]], capR: [[0.10, 0.07, -0.17], [0.035, 0.085, -0.245]],   // to the lid tabs
    capDropF: [[0.19, -0.17, -0.31], [0.17, -0.24, -0.37]], capDropR: [[0.23, -0.17, -0.22], [0.21, -0.24, -0.28]],
    elev: [[0.07, 0.164, -0.347], [0.004, 0.14, -0.41]], windage: [[0.115, 0.047, -0.366], [0.045, 0.086, -0.41]], parallax: [[-0.10, 0.07, -0.38], [-0.045, 0.086, -0.41]],
    bag: [[-0.075, -0.17, -0.02], [-0.02, -0.16, -0.09]], magwell: [[0.04, -0.20, -0.46], [0.0, -0.13, -0.49]], boltcatch: [[-0.06, -0.06, -0.38], [-0.02, -0.04, -0.42]],
    write: [[-0.20, -0.20, -0.25], [-0.25, -0.235, -0.33]], notebook: [[-0.36, -0.21, -0.30], [-0.30, -0.235, -0.33]],
    kestrel: [[-0.12, 0.06, -0.40], [-0.15, 0.12, -0.45]], kestrelUp: [[-0.22, 0.42, -0.42], [-0.24, 0.52, -0.44]], kestrelRead: [[-0.20, -0.02, -0.56], [-0.18, 0.08, -0.60]], magload: [[-0.12, -0.17, -0.40], [-0.17, -0.18, -0.45]], mag: [[-0.25, -0.18, -0.42], [-0.18, -0.18, -0.45]],
    maginspect: [[-0.06, -0.02, -0.42], [-0.12, 0.02, -0.48]],
  };
  const lookTargets = { port: () => rifle.localToWorld(V(0.02, 0, -0.43)), mag: () => magProp.getWorldPosition(V()), kestrel: () => kestrel.getWorldPosition(V()), notebook: () => notebook.getWorldPosition(V()) };

  function render(S, T) {
    curS = S;
    // rifle
    const rm = rifleMatrix(S); rifle.position.copy(rm.p); rifle.quaternion.copy(rm.q);
    // recoil from shots
    let recoil = 0;
    for (const sh of SHOTS) { const t = bt(sh, T); if (t >= 0 && t < 0.6) recoil = Math.max(recoil, Math.exp(-t * 10) * Math.sin(Math.min(t * 45, Math.PI)) * 0.035); }
    if (S.rifle.mode === "ground") rifle.position.add(V(0, 0, recoil).applyQuaternion(rifle.quaternion));
    rifle.updateMatrixWorld(true);
    RP.bipodF.visible = !S.rifle.bipod; RP.bipodD.visible = S.rifle.bipod;
    RP.ch.position.copy(chRest).add(V(0, 0, 0.09 * S.rifle.rack));
    const boltBack = S.rifle.boltOpen ? 1 : 0;
    // action cycle after each shot (real time) or in the slow replay: carrier back 110 mm and home again in ~0.11 s
    let cyc = S.cycleT ?? null;
    for (const sh of SHOTS) { const t = bt(sh, T); if (t >= 0 && t < 0.7) cyc = t; }
    const back = cyc == null ? 0 : cyc < 0.04 ? cyc / 0.04 : cyc < 0.06 ? 1 : cyc < 0.11 ? 1 - (cyc - 0.06) / 0.05 : 0;
    RP.bolt.position.copy(boltRest).add(V(0, 0, 0.09 * Math.max(boltBack, back)));   // locked back: bolt face at the rear edge of the port
    RP.dust.visible = !S.rifle.boltOpen && !SHOTS.some(s => T >= s.t0);   // the port cover opens with the bolt (it stays open after firing)
    S.caseT = cyc;
    RP.mag.visible = S.rifle.magIn;
    RP.sel.quaternion.copy(selRest).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.9 * (S.rifle.selK ?? (S.rifle.safety === "P" ? 1 : 0))));
    // soldier
    let clipsList = S.man.clips;
    if (clipsList.length === 1 && clipsList[0][0] === "Walking") clipsList = [["Walking", (S.man.walk / 1.35) % 1.0, 1]];
    placeSoldier(man, S.man.at.clone().setY(hAt(S.man.at.x, S.man.at.z)), S.man.yaw, clipsList);
    if (S.rifle.mode !== "ground") { const r2 = rifleMatrix(S); rifle.position.copy(r2.p); rifle.quaternion.copy(r2.q); rifle.updateMatrixWorld(true); }
    const rig = man.rig;
    // life: breathing (torso rises and falls), small head turns and weight shifts; driven by T so scrubbing stays exact
    const prone_ = clipsList.some(c => c[0] === "Prone_Fire" && c[2] > 0.5);
    clipsList_ = clipsList;
    if (prone_ && S.rifle.mode === "ground") {
      // stock in the shoulder pocket: roll the torso until the right shoulder is down at the butt pad, then slide the
      // body so the shoulder sits just right of and behind the pad; the head turns to the eyepiece (cheek on the rest)
      const pocket = rifle.localToWorld(V(0.06, -0.035, 0.06));
      const fwdW = V(0, 0, 1).applyQuaternion(man.m.quaternion), Y = b => rig.B[b].getWorldPosition(V()).y;
      const turn = (axis, ang, list) => { for (const b of list) { const q = new THREE.Quaternion().setFromAxisAngle(axis, ang / list.length), pq = new THREE.Quaternion();
        b.getWorldQuaternion(pq); const nw = q.multiply(pq); b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true); } };
      // 0) hips and legs on the ground: the whole body down until the hips are ~12 cm above the ground (body thickness)
      const hp = rig.B.Hips.getWorldPosition(V()), hipUp = hp.y - hAt(hp.x, hp.z) - 0.12;
      man.m.position.y -= hipUp; man.m.updateMatrixWorld(true);
      // 0b) legs flat on the ground (KBW prone board: legs straight in a V, knees and feet on the ground): thighs and
      // shins turned about the hip and knee so the knee and the foot lie on the surface
      const aimTo = (bone, child, target) => { const bp = bone.getWorldPosition(V()), from = child.getWorldPosition(V()).sub(bp).normalize(), to = target.clone().sub(bp).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(from, to), pq = new THREE.Quaternion(); bone.getWorldQuaternion(pq); const nw = q.multiply(pq);
        bone.parent.getWorldQuaternion(pq); bone.quaternion.copy(pq.invert().multiply(nw)); bone.updateMatrixWorld(true); };
      const onGround = (o, lift) => { const p = o.getWorldPosition(V()); p.y = hAt(p.x, p.z) + lift; return p; };
      for (const P of ["Left", "Right"]) {
        const up_ = rig.B[P + "UpLeg"] || man.m.getObjectByName("mixamorig" + P + "UpLeg"), knee = man.m.getObjectByName("mixamorig" + P + "Leg"), foot = man.m.getObjectByName("mixamorig" + P + "Foot");
        if (!up_ || !knee || !foot) continue;
        aimTo(up_, knee, onGround(knee, 0.075)); aimTo(knee, foot, onGround(foot, 0.085)); }
      // 1) chest about the hips until the shoulders average the pad height (down, or up if the body came too low)
      const avg = (Y("RightArm") + Y("LeftArm")) / 2, down = Math.max(-0.5, Math.min(0.6, Math.asin(Math.max(-1, Math.min(1, (avg - pocket.y - 0.03) / 0.55)))));
      rig.bend(down);
      // 2) a small roll: right shoulder ~4 cm below the left, as with the butt in the shoulder pocket
      const lvl = (Y("RightArm") - Y("LeftArm")) + 0.04, roll = Math.max(-0.35, Math.min(0.35, Math.atan2(lvl, 0.34)));
      turn(fwdW, roll, [rig.B.Spine1, rig.B.Spine2]);
      const d = pocket.clone().sub(rig.B.RightArm.getWorldPosition(V())); d.y = 0;   // the height is set by the hips and the chest above
      man.m.position.add(d); man.m.updateMatrixWorld(true);
      // cheek weld (as in the reference video): eye 7 cm behind the eyepiece on the scope axis, face along the line of sight
      if (!S.man.look) rig.eyeTo(rifle.localToWorld(V(0, 0.0857, -0.2314 + 0.07)), V(0, 0, -1).applyQuaternion(rifle.quaternion));
    }
    if (S.man.kneelHinge) rig.hinge(S.man.lean || 0, window.__kwStraight ?? 0.45); else rig.bend(S.man.lean || 0);   // kneeling over the rifle: a flat back
    rig.bend((prone_ ? 0.012 : 0.022) * Math.sin(2 * Math.PI * T / 4.2));
    // nothing under the ground: when blended poses (kneel -> prone) push a body part below the surface, lift the soldier
    { let low = Infinity;
      for (const [n, clear] of [["Hips", 0.1], ["Spine1", 0.1], ["Spine2", 0.1], ["Head", 0.12], ["LeftLeg", 0.06], ["RightLeg", 0.06], ["LeftFoot", 0.05], ["RightFoot", 0.05], ["LeftToe_End", 0.0], ["RightToe_End", 0.0], ["LeftForeArm", 0.05], ["RightForeArm", 0.05]]) {
        if (prone_ && /ForeArm/.test(n)) continue;              // prone: the forearms are set later by the hands on the rifle
        const b = man.m.getObjectByName("mixamorig:" + n) || man.m.getObjectByName("mixamorig" + n); if (!b) continue;
        const p = b.getWorldPosition(V()); low = Math.min(low, p.y - hAt(p.x, p.z) - clear); }
      if (low < 0) { man.m.position.y -= low; man.m.updateMatrixWorld(true); } }
    if (rig.B.Head && !S.man.look) rig.B.Head.rotateY(0.05 * Math.sin(2 * Math.PI * T / 7.3) + 0.025 * Math.sin(2 * Math.PI * T / 2.9));
    if (rig.B.Hips && !prone_) rig.B.Hips.rotateZ(0.012 * Math.sin(2 * Math.PI * T / 5.6));
    man.m.updateMatrixWorld(true);
    if (S.man.look && lookTargets[S.man.look]) rig.look(lookTargets[S.man.look](), 0.8);
    const armJobs = [];
    for (const side of ["R", "L"]) {                          // a key, or {from, to, k}: the hand travels between two holds
      const h = S.man[side]; if (!h) continue;
      if (h.man) { rig.arm(side, man.m.localToWorld(V(...h.man[0])), man.m.localToWorld(V(...h.man[1]))); continue; }
      const tgt = window.__hk && window.__hk.key === h ? [window.__hk.wrist, HANDS[h][1]] : h === "grip" && window.__gripWrist ? [window.__gripWrist, HANDS.grip[1]] : typeof h === "string" ? HANDS[h] : (() => { const a = HANDS[h.from], b = HANDS[h.to]; return a && b ? [0, 1].map(i => a[i].map((v, j) => v + (b[i][j] - v) * h.k)) : null; })();
      if (!tgt) continue;
      let wr = V(...tgt[0]); const tax = side === "R" && typeof h === "string" ? TURRET_AX[h] : null;
      if (tax) wr = wr.sub(tax.p).applyAxisAngle(tax.a, twistOf(h, S)).add(tax.p);
      // kneeling over the rifle: if the hand cannot reach its hold, bend the torso a little more until it can
      // (one smooth amount, capped: bending in steps made the torso jitter frame to frame and hunch too far)
      if (!prone_) { const P = side === "R" ? "Right" : "Left", up_ = rig.B[P + "Arm"], fo = rig.B[P + "ForeArm"], ha = rig.B[P + "Hand"];
        const reach = 0.97 * (up_.getWorldPosition(V()).distanceTo(fo.getWorldPosition(V())) + fo.getWorldPosition(V()).distanceTo(ha.getWorldPosition(V())));
        const tw = rifle.localToWorld(wr.clone()), d0 = up_.getWorldPosition(V()).distanceTo(tw);
        if (d0 > reach) { rig.bend(0.2); man.m.updateMatrixWorld(true); const d1 = up_.getWorldPosition(V()).distanceTo(tw);   // linear estimate from one probe
          const need = d0 > d1 ? Math.min(0.35, 0.2 * (d0 - reach) / (d0 - d1)) : 0; rig.bend(-0.2); rig.hinge(need); man.m.updateMatrixWorld(true); } }
      armJobs.push([side, wr, V(...tgt[1])]);
    }
    for (const [side, wr, kn] of armJobs) rig.arm(side, rifle.localToWorld(wr), rifle.localToWorld(kn));   // after all the bending
    // Kestrel in the left hand (author, 18 XI): hand upright, palm turned to the face, the device pinched at its lower end
    // between thumb and index finger and standing above the hand
    const kesHold = () => { const L_ = S.man.L, key = typeof L_ === "string" ? L_ : L_ && L_.to; return /kestrel/.test(key || "") && S.props.kestrel && S.props.kestrel !== "ground"; };
    if (kesHold()) { const hb = rig.B.LeftHand, hp = hb.getWorldPosition(V()), toFace = rig.B.Head.getWorldPosition(V()).sub(hp).setY(0).normalize();
      const Y = V(0, 1, 0), X = toFace, Z = X.clone().cross(Y).normalize(), pq = new THREE.Quaternion();
      const qh = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      hb.parent.getWorldQuaternion(pq); hb.quaternion.copy(pq.invert().multiply(qh)); hb.updateMatrixWorld(true); }
    // turrets: the hand's orientation is set in the rifle frame (thumb and index pinch the cap), measured below
    { const key = typeof S.man.R === "string" ? S.man.R : null, hk = window.__hk && window.__hk.key === key ? window.__hk : null;
      const eul = hk ? hk.euler : HAND_ORIENT[key];
      if (eul) { const tax = TURRET_AX[key], tw = tax ? new THREE.Quaternion().setFromAxisAngle(tax.a, twistOf(key, S)) : new THREE.Quaternion();
        const qh = rifle.getWorldQuaternion(new THREE.Quaternion()).multiply(tw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...eul, "YXZ")));
        const hb = rig.B.RightHand, pq = new THREE.Quaternion(); hb.parent.getWorldQuaternion(pq); hb.quaternion.copy(pq.invert().multiply(qh)); hb.updateMatrixWorld(true); } }
    if (S.man.R === "grip") {
      const rq = rifle.getWorldQuaternion(new THREE.Quaternion());
      const GT = window.__gripTune || GRIP_TUNE;                  // hand pitch on the grip (test hook: __gripTune)
      const X = V(1, 0, 0).applyQuaternion(rq), Y = V(0, -GT.pitch, -1).normalize().applyQuaternion(rq), Z = X.clone().cross(Y).normalize(); X.copy(Y.clone().cross(Z));
      if (GT.roll) { const qr = new THREE.Quaternion().setFromAxisAngle(Y, GT.roll); X.applyQuaternion(qr); Z.applyQuaternion(qr); }
      const qh = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)), hb = rig.B.RightHand, pq = new THREE.Quaternion();
      hb.parent.getWorldQuaternion(pq); hb.quaternion.copy(pq.invert().multiply(qh)); hb.updateMatrixWorld(true);
    }
    portLight.intensity = S.rifle.boltOpen ? (window.__portI ?? 0.35) : 0;
    placeCap(capF, "F", S.rifle.capF); placeCap(capR, "R", S.rifle.capR);
    const turn = (o, rest, axis, a) => { if (o) o.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, a)); };
    turn(KN.elev, knRest.elev, V(0, 1, 0), dialAngle("elev", S));                       // the set value at the index mark
    turn(KN.wind, knRest.wind, V(1, 0, 0), dialAngle("wind", S));
    turn(KN.plx, knRest.plx, V(1, 0, 0), dialAngle("plx", S));
    rig.curl("R", S.man.curl.R, { indexOn: S.man.trigger || S.man.R === "chamber" }); rig.curl("L", S.man.curl.L);
    // sling strap while carried
    if (S.rifle.mode === "sling" || (S.rifle.mode === "carry" && S.rifle.blend < 0.3)) {
      const b = rig.B, sc = 1, pts = [rifle.localToWorld(V(-0.026, 0, -0.85)), b.LeftArm.localToWorld(V(0, 0.07, 0.09)), b.LeftShoulder.localToWorld(V(0, 0.1, 0)),
        b.Spine2.localToWorld(V(0.02, 0.06, -0.16)), b.Spine1.localToWorld(V(-0.15, -0.02, -0.12)), b.RightArm.localToWorld(V(-0.02, -0.13, -0.02)), rifle.localToWorld(V(0, -0.02, -0.195))];
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), 60, 0.011, 4, false);
      if (strap) { strap.geometry.dispose(); strap.geometry = geo; strap.visible = true; } else { strap = new THREE.Mesh(geo, strapMat); strap.castShadow = true; scene.add(strap); }
    } else if (strap) strap.visible = false;
    // instructor: stands beside the spotter, faces the shooter
    { const I = S.inst, cl = I.clips ? I.clips.map(c => c[0] === "Walking" ? ["Walking", (I.walk / 1.35) % 1.0, 1] : c) : [["Idle", T % 8, 1]];
      placeSoldier(inst, I.at.clone().setY(hAt(I.at.x, I.at.z)), I.yaw, cl);
      inst.rig.bend(I.lean || 0);
      inst.rig.look(I.look === "port" ? rifle.localToWorld(V(0.02, 0, -0.43)) : man.rig.B.Head.getWorldPosition(V()), 0.7); }
    // props
    notebook.visible = !!S.props.notebook; if (notebook.visible) { notebook.position.copy(rifle.localToWorld(V(-0.29, -0.245, -0.32))); notebook.quaternion.copy(qGround); }
    kestrel.visible = !!S.props.kestrel;
    if (S.props.kestrel === "ground") {                    // lying flat right of the stock, display up, top towards the target
      const p = rifle.localToWorld(V(-0.26, 0, -0.50)); p.y = hAt(p.x, p.z) + 0.015; kestrel.position.copy(p);   // put down on the left of the handguard, by the hand that held it
      const Yv = V(0, 0, -1).applyQuaternion(rifle.quaternion).setY(0).normalize(), Zv = V(0, 1, 0), Xv = Yv.clone().cross(Zv).normalize();
      kestrel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xv, Yv, Zv)); impeller.rotation.x = 0; }

    magProp.visible = !!S.props.mag;
    const MAG_C = V(0, -0.083, -0.46);                               // centre of the magazine in rifle coordinates
    if (S.props.mag === "chest") {                                   // held upright in front of the chest, lips up
      const q = man.m.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
      magProp.quaternion.copy(q); magProp.position.copy(man.m.localToWorld(V(0.0, 1.0, 0.34))).sub(MAG_C.clone().applyQuaternion(q));
    } else if (magProp.visible) {
      const at = { hands: V(-0.17, -0.2, -0.43), well: V(0, -0.2, -0.47), inspect: V(-0.09, -0.02, -0.47), ground: V(-0.22, -0.21, -0.55) }[S.props.mag] || V();
      magProp.position.copy(rifle.localToWorld(at)); magProp.quaternion.copy(rifle.quaternion);
    }
    rounds.forEach((r, i) => {                                       // loose rounds in the left palm, pushed into the magazine one by one
      r.visible = (S.props.mag === "hands" || S.props.mag === "chest") && i >= S.props.roundsInMag;
      if (S.props.mag === "chest") { r.position.copy(man.rig.B.LeftHand.localToWorld(V(0.0, 0.08, 0.03 + i * 0.014))); r.quaternion.copy(man.rig.B.LeftHand.getWorldQuaternion(new THREE.Quaternion())); }
      else { r.position.copy(rifle.localToWorld(V(-0.25 + i * 0.02, -0.235, -0.36))); r.quaternion.copy(qGround).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2)); } });
    // gloved hands with fingers (hands.js): finger pose from what the hand is doing; the mitten is collapsed here
    { const h = S.man.R, key = typeof h === "string" ? h : h && (h.to || (h.man ? "man" : null));
      const hold = { capF: 0.55, capR: 0.55, capDropF: 0.55, capDropR: 0.55, kestrel: 0.7, kestrelUp: 0.7, kestrelRead: 0.7, write: 0.6, magwell: 0.65, magload: 0.6, maginspect: 0.6, elev: 0.5, windage: 0.5, charging: 0.7, man: 0.6 }[key];
      const index = S.man.trigger ? 0.42 : key === "chamber" ? 0.0 : key === "grip" ? 0.06 : key === "write" ? 0.45 : null;   // off the trigger along the receiver unless firing
      // on the grip the index finger is raised: its pad on the trigger when firing, otherwise straight along the receiver
      // above the trigger guard; middle, ring and little finger wrap the front of the grip (angles measured on the Grot)
      const gripIdx = key === "grip" ? { gripA: [0.9, 1.2, 0.4], ...(S.man.trigger ? { indexA: [0, 1.65, 0.45 + 0.3 * (S.man.press || 0)] } : { indexA: [-0.5, 0, 0], indexUp: -0.35 }) } : {};
      const tk = key === "grip" ? (S.man.thumbK || 0) : 0;            // thumb from the grip to the safety lever (measured on the Grot)
      // thumb at rest along the right side of the receiver (author, 18 XI); it goes over to the lever only for the safety
      const TR = [-0.8, 0.3, 0.2], TRU = 0.9,   /* raised 30 degrees (author, 18 XI) */ TL = [-0.3, 0.8, 0.8], TLU = -0.3;
      const thumbPose = key === "grip" ? { thumbA: TR.map((v, i) => v + (TL[i] - v) * tk + (i === 1 ? 0.15 * (S.rifle.selK ?? 0) * tk : 0)), thumbUp: TRU + (TLU - TRU) * tk } : {};
      const fp_ = (window.__hk && window.__hk.key === key ? window.__hk.fingers : FINGER_POSE[key]) || {};
      handsMan.update({ R: { curl: key === "chamber" ? 0.75 : hold ?? (h ? S.man.curl.R : 0.25), index, thumb: key === "grip" ? 0.6 : null, ...gripIdx, ...thumbPose, ...fp_ },
                        L: kesPinch() ? { curl: window.__kc ?? 0.75, thumbA: window.__kt ?? [0.3, 0.45, 0.35], thumbUp: window.__ku ?? 0.45 } : { curl: S.man.L ? (/kestrel/.test(typeof S.man.L === "string" ? S.man.L : S.man.L.to || "") ? 0.7 : S.man.L === "bag" ? 0.75 : S.man.L === "handguard" ? 0.6 : 0.55) : 0.25 } }); 
    if (kestrel.visible && S.props.kestrel !== "ground") {   // after the hands are posed this frame
      // held from below in the fingertips, the whole device above the hand (author, 18 XI)
      const hb = man.rig.B.LeftHand, hq = hb.getWorldQuaternion(new THREE.Quaternion()), hy = V(0, 1, 0).applyQuaternion(hq).normalize();
      const hh = handsMan.hands.L, tipW = bn => bn.localToWorld(V(0, bn.children[0]?.position.length() || 0.02, 0));
      // gripped by its sides (author, 18 XI): thumb on one edge, the fingers on the other, the body in front of the palm
      const tT = tipW(hh.fing.thumb[2]), tM = tipW(hh.fing.middle[2]), toF = man.rig.B.Head.getWorldPosition(V()).sub(tT).setY(0).normalize();
      const kp = tT.clone().lerp(tM, 0.5).addScaledVector(toF, window.__kf ?? 0.004).addScaledVector(hy, window.__kY ?? 0.035); kestrel.position.copy(kp);
      // the display (+Z of the model) always turned to the shooter's face (author, 18 XI)
      const dz = man.rig.B.Head.getWorldPosition(V()).sub(kp), zz = dz.addScaledVector(hy, -dz.dot(hy)).normalize(), xx = hy.clone().cross(zz).normalize();
      kestrel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, hy, zz)); impeller.rotation.x = S.props.spin || 0; }
      handsInst.update({ R: { curl: 0.3 }, L: { curl: 0.3 } }); }
    // shots: tracer, flash, case, gong
    tracer.visible = false; flash.visible = false; flashLight.intensity = 0; caseEject.visible = false;
    const hits = [];
    let swing = 0;
    for (const sh of SHOTS) {
      const t = bt(sh, T); if (t < 0) continue;
      const minD = S.cam && S.cam.kind === "scope" ? 40 : 2;          // in the scope the first metres would fill the eyepiece
      if (t < TOF && rangeAtTime(t) > minD) { const d = rangeAtTime(t), d0 = Math.max(minD, d - 45), a = pathAt(d0, sh.n), b = pathAt(d, sh.n);
        const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b), r = Math.max(0.004, camera.position.distanceTo(mid) * Math.tan(camFov(S) * Math.PI / 360) * (S.cam && S.cam.kind === "scope" ? 0.0028 : 0.012));
        tracer.visible = true; tracer.position.copy(a).add(b).multiplyScalar(0.5); tracer.scale.set(r, len, r);
        tracer.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); }
      if (t < 0.09) { flash.visible = true; flash.position.copy(rifle.localToWorld(MUZZLE.clone())); flash.scale.setScalar((1 + t * 25) * 0.3); flash.material.opacity = 0.6 - t * 6; /* suppressed: small, dim flash */ flashLight.position.copy(flash.position); flashLight.intensity = 30 * (1 - t / 0.09); }
      if (t >= TOF) { hits.push(impact(sh.n)); const tau = t - TOF; swing += 0.32 * Math.exp(-1.1 * tau) * Math.sin(6.5 * tau); }
    }
    drawMarks(hits); pivot.rotation.x = swing;
    if (S.caseT != null && S.caseT >= 0.03 && S.caseT < 0.7) {     // extracted with the carrier, then thrown out of the port to the right
      const tc = S.caseT - 0.03, inside = Math.min(tc, 0.012);
      const p = V(0.0 + Math.max(0, tc - 0.012) * 3.2, 0.004 + Math.max(0, tc - 0.012) * 1.6 - 4.9 * Math.max(0, tc - 0.012) ** 2, -0.47 + inside * 6 + Math.max(0, tc - 0.012) * 0.9);
      caseEject.visible = true; caseEject.position.copy(rifle.localToWorld(p));
      caseEject.quaternion.copy(rifle.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + tc * 40, tc * 25, 0)));
    }
    // overlays
    for (const id of ["glove", "dial", "note", "windLook", "kes", "f", "card", "sel", "slow", "arc"]) OV.show(id, S.ov[id] ? S.ov[id][0] : null, S.ov[id] ? S.ov[id][1] : "");
    // camera
    if (freeCam) { freeMove(); controls.update(); setScope(null); man.m.visible = rifle.visible = capF.visible = capR.visible = true; camera.fov = 50; camera.updateProjectionMatrix(); setFocus(controls.target); return; }
    const c = S.cam || { kind: "follow", off: [2.5, 1.2, 1.5], look: [0, 0.8, 0] };
    if (fpp && c.kind !== "scope") { setScope(null); man.m.visible = rifle.visible = capF.visible = capR.visible = true; fppCamera(S); setFocus(null); return; }
    if (fpp) fppInit = false;                                      // back from the scope: the eyes pick up the new target at once
    setScope(c.kind === "scope" ? S.scope : null, T);
    man.m.visible = rifle.visible = c.kind !== "scope";             // the eye sits inside the head mesh
    capF.visible = capR.visible = c.kind !== "scope";               // the flip-up lids sit in front of the objective
    for (const h of Object.values(handsMan.hands)) h.g.visible = c.kind !== "scope";   // hands at the turrets would sit in front of the eye
    kestrel.visible = kestrel.visible && c.kind !== "scope"; notebook.visible = notebook.visible && c.kind !== "scope";
    if (grass) grass.visible = c.kind !== "scope";                    // prone eye is 0.37 m up, inside the grass tufts
    if (c.kind === "scope") { setFocus(null); return scopeCamera(S.scope, T, recoil); }
    camera.fov = c.fov || 45;
    if (c.kind === "follow") {
      const q = man.m.quaternion, o = V(...c.off), l = V(...c.look);
      focusPt = man.m.position.clone().add(V(-l.x, l.y, l.z).applyQuaternion(q));
      camera.position.copy(man.m.position).add(V(-o.x, o.y, o.z).applyQuaternion(q)); camera.lookAt(focusPt);
    } else if (c.kind === "rifle") {                                   // close-ups on the rifle, pulled back 1.5x for context
      const lk = V(...c.look), ps = V(...c.pos).sub(lk).multiplyScalar(c.near ? 1 : 1.5).add(lk);
      focusPt = rifle.localToWorld(lk); camera.position.copy(rifle.localToWorld(ps)); camera.lookAt(focusPt); }
    else if (c.kind === "world") { focusPt = c.look.clone(); camera.position.copy(c.pos); camera.lookAt(c.look); }
    else if (c.kind === "hand") {                                   // on the right hand, from the rifle's right side and a little above
      // from the back of the glove and the index-finger side, so the cut fingertip is in view
      const h = handsMan.handPoint("R", 0, 0.15, 0.02), rq = rifle.quaternion;
      const dir = V(1, 0, 0).applyQuaternion(rq).add(V(0, 0.18, 0)).add(V(0, 0, 0.12).applyQuaternion(rq)).normalize();
      focusPt = h; camera.position.copy(h).addScaledVector(dir, c.dist || 0.6); camera.lookAt(h); }
    else if (c.kind === "gong") { const toShooter = fp.clone().sub(gongBase).normalize(), side = V(toShooter.z, 0, -toShooter.x);
      camera.position.copy(gongBase).addScaledVector(toShooter, -1.6).addScaledVector(side, 2.2).add(V(0, 1.2, 0)); camera.fov = 50;
      camera.lookAt(GC.clone().addScaledVector(toShooter, 3.0)); focusPt = GC.clone(); }
    else if (c.kind === "head") {                                    // side of the head: ear defenders
      const who = c.who === "inst" ? inst : man, h = who.rig.B.Head.getWorldPosition(V()).add(V(0, 0.07, 0)), q = who.m.quaternion;
      camera.position.copy(h).add(V(-0.55, 0.06, 0.35).applyQuaternion(q)); camera.fov = 35; camera.lookAt(h); focusPt = h; }
    else if (c.kind === "prop") {                                    // close-up on the Kestrel, square to its display
      const kp = kestrel.getWorldPosition(V()).add(V(0, 0.03, 0).applyQuaternion(kestrel.quaternion));
      camera.position.copy(kp).add(V(0.05, 0.02, window.__kcam ?? 1).normalize().multiplyScalar(c.dist).applyQuaternion(kestrel.quaternion)); camera.fov = 36; camera.lookAt(kp); focusPt = kp; }
    else if (c.kind === "kestrelGround") {                       // straight down onto the display, a little from the side
      const kp = kestrel.getWorldPosition(V()).add(V(0, 0, -0.012).applyQuaternion(kestrel.quaternion).multiplyScalar(0));
      const lcd = kestrel.localToWorld(V(0, -0.005, 0.012));
      camera.position.copy(lcd).add(V(0, 0.24, 0)).addScaledVector(V(0, -1, 0).applyQuaternion(kestrel.quaternion).setY(0).normalize(), 0.07);
      camera.up.set(0, 1, 0); camera.fov = 34; camera.lookAt(lcd); focusPt = lcd; }
    else if (c.kind === "gongClose") { const toShooter = fp.clone().sub(gongBase).normalize(); camera.position.copy(GC).addScaledVector(toShooter, 1.5); camera.fov = 40; camera.lookAt(GC); focusPt = GC.clone(); }
    if (focusPt && c.kind !== "gong") {                              // handheld drift + slow push-in towards the subject
      const d = camera.position.distanceTo(focusPt), uB = S.beat ? Math.min(1, S.tInBeat / S.beat.dur) : 0;
      camera.position.lerp(focusPt, 0.07 * ease(uB));
      const k = 0.012 * Math.max(0.3, Math.min(3, d));
      camera.position.add(V(Math.sin(T * 0.53) * k, Math.sin(T * 0.41 + 1.3) * k * 0.7, Math.sin(T * 0.37 + 2.1) * k));
      camera.lookAt(focusPt);
    }
    const gy = hAt(camera.position.x, camera.position.z) + 0.08; if (camera.position.y < gy) camera.position.y = gy;
    camera.updateProjectionMatrix();
    const close = ["rifle", "hand", "head"].includes(c.kind);
    fill.intensity = close ? 1.6 : 0; if (close && focusPt) { fill.position.copy(camera.position).add(V(0, 0.4, 0)); fill.target.position.copy(focusPt); }
    setFocus(c.focus || focusPt, c.aperture ?? (c.kind === "gong" ? 0.0005 : c.focusExact ? 0.0035 : null), !!c.focusExact);   // gong insert: tracer stays visible; rack focus: sharp exactly at the point
  }
  let focusPt = null;
  // depth of field: sharp on what the shot is about, background and foreground soft (closer subject = shallower field)
  function setFocus(p, aperture = null, exact = false) {
    bokeh.enabled = !!p; if (!p) return;
    // the shader blurs linearly with |depth - focus|: put the focus a few metres behind the subject and keep the aperture
    // small, so the subject and its surroundings stay sharp and only the distance goes soft
    const dir = camera.getWorldDirection(V()), dist = Math.max(0.15, p.clone().sub(camera.position).dot(dir));
    bokeh.uniforms.focus.value = exact ? dist : dist + Math.max(2.5, dist);
    bokeh.uniforms.aperture.value = aperture ?? (dist < 1 ? 0.0012 : 0.0006);
    bokeh.uniforms.maxblur.value = 0.008;
  }

  // ---------- scope view: true field of view of the PM II 3-12x50, FFP mil-dot reticle, breathing ----------
  function scopeGeom(mag) {
    const H = innerHeight, Rpx = Math.min(innerWidth, H) * 0.42, tfov = 366 / mag / 1000;       // rad, full field (12 m at 3x, 3.1 m at 12x per 100 m)
    const f = Rpx / Math.tan(tfov / 2);
    return { Rpx, f, vfov: 2 * Math.atan(H / 2 / f) * 180 / Math.PI, pxPerMrad: f * 0.001 };
  }
  function setScope(sc, T) {
    if (!sc) { if (scopeOv) { scopeOv.style.display = "none"; } canvas.style.filter = ""; return; }
    if (!scopeOv) { scopeOv = document.createElement("div"); scopeOv.style.cssText = "position:fixed;inset:0;z-index:60;pointer-events:none"; document.body.append(scopeOv); }
    scopeOv.style.display = "block";
    const g_ = scopeGeom(sc.mag), key = `${sc.mag.toFixed(2)}|${innerWidth}|${innerHeight}|${sc.measure}`;
    if (key !== lastMag) {
      lastMag = key;
      const W_ = innerWidth, H = innerHeight, cx = W_ / 2, cy = H / 2, R = g_.Rpx, k = g_.pxPerMrad;
      let s = `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="#0b0b0b" stroke-width="1.3"/><line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="#0b0b0b" stroke-width="1.3"/>`;
      for (let m = -10; m <= 10; m++) { if (!m) continue; const d = m * k; if (Math.abs(d) > R) continue;
        s += `<circle cx="${cx + d}" cy="${cy}" r="${Math.max(1.2, 0.1 * k)}" fill="#0b0b0b"/><circle cx="${cx}" cy="${cy + d}" r="${Math.max(1.2, 0.1 * k)}" fill="#0b0b0b"/>`; }
      for (const [x1, y1, x2, y2] of [[cx - R, cy, cx - 10 * k, cy], [cx + 10 * k, cy, cx + R, cy], [cx, cy + 10 * k, cx, cy + R]]) s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0b0b0b" stroke-width="${Math.max(3, 0.4 * k)}"/>`;

      scopeOv.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, transparent ${R - 4}px, rgba(0,0,0,.92) ${R + 1}px, #000 ${R + 3}px)"></div>
        <svg width="${W_}" height="${H}" style="position:absolute;inset:0">${s}</svg><svg class="measure" width="${W_}" height="${H}" style="position:absolute;inset:0"></svg>
        <div style="position:absolute;bottom:120px;width:100%;text-align:center;color:#aaa;font:13px monospace">S&amp;B PM II 3-12×50 · ${sc.mag.toFixed(1).replace(".", ",")}× · siatka mil-dot (FFP)</div>`;
    }
    canvas.style.filter = sc.blur ? `blur(${Math.min(6, sc.blur).toFixed(1)}px)` : "";
    // the measured size drawn along the real edges of the plate, projected every frame (the reticle moves over it)
    const ms = scopeOv.querySelector("svg.measure");
    if (ms) { let m = "";
      if (sc.measure) {
        const side = V(-fwd.z, 0, fwd.x).normalize(), scr = p => { const v = p.clone().project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; };
        const top = scr(GC.clone().add(V(0, 0.5, 0))), bot = scr(GC.clone().add(V(0, -0.5, 0)));
        const l = scr(GC.clone().addScaledVector(side, -0.25)), r = scr(GC.clone().addScaledVector(side, 0.25));
        const xr = Math.max(l[0], r[0]), xl = Math.min(l[0], r[0]);
        const tick = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f2c94c" stroke-width="2"/>`;
        if (sc.measure === "h") { const x = xr + 10; m = tick(x, top[1], x, bot[1]) + tick(x - 6, top[1], x + 6, top[1]) + tick(x - 6, bot[1], x + 6, bot[1])
          + `<text x="${x + 10}" y="${(top[1] + bot[1]) / 2 + 7}" fill="#f2c94c" font-size="22" font-family="system-ui" font-weight="700">1,6 mil</text>`; }
        if (sc.measure === "w") { const y = Math.min(top[1], bot[1]) - 12; m = tick(xl, y, xr, y) + tick(xl, y - 6, xl, y + 6) + tick(xr, y - 6, xr, y + 6)
          + `<text x="${xl}" y="${y - 12}" fill="#f2c94c" font-size="22" font-family="system-ui" font-weight="700">0,8 mil</text>`; } }
      if (ms.innerHTML !== m) ms.innerHTML = m; }
  }
  function scopeCamera(sc, T, recoil) {
    const g_ = scopeGeom(sc.mag);
    camera.fov = g_.vfov; camera.updateProjectionMatrix();
    const eye = rifle.localToWorld(EYE.clone());
    const SLOW = 5;                                                   // sway runs 5x slower than first built (author, scene 14)
    const period = (sc.breathT || 4.2) * SLOW, br = sc.breath ?? 0.25;
    const pitch = (sc.pitch || 0) + br * Math.sin(2 * Math.PI * T / period) + br * 0.25 * Math.sin(2 * Math.PI * T / (1.3 * SLOW)) + recoil * 120 + (sc.wobble || 0) * 0.3;
    const yaw = (sc.yaw || 0) + br * 0.35 * Math.sin(2 * Math.PI * T / (period * 1.7)) + (sc.wobble || 0);
    const dir = losDir.clone().addScaledVector(losRight, yaw / 1000).addScaledVector(losUp, pitch / 1000).normalize();
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(eye.clone().add(dir));
  }

  // ---------- frame loop ----------
  let prevT = 0;
  const hook = dt => {
    standGrassTime.value += dt;
    tl.step(dt);
    const T = tl.T;
    if (tl.playing && T > prevT) {                         // one-shot sounds crossed this frame
      for (const sh of SHOTS) { const a = bt(sh, prevT), b = bt(sh, T); if (a < 0 && b >= 0) snd.shot(); const td = TOF + SOUND_BACK; if (a < td && b >= td) snd.ding(); }
    }
    prevT = T;
    render(tl.evaluate(T), T);
    panel.update();
  };
  // ---------- load everything before the first frame: narration buffers, then one render of every beat ----------
  // (shaders, textures and overlay layouts get built here, not in the middle of the scene)
  const veil = document.createElement("div");
  veil.style.cssText = "position:fixed;inset:0;z-index:200;background:#0d0f11;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font:16px system-ui";
  veil.innerHTML = `<div style="font-weight:600;color:#f2c94c">${TITLE}</div><div id="veilTxt">Wczytywanie nagrań lektora…</div><div style="width:320px;height:6px;background:#333;border-radius:3px"><div id="veilBar" style="height:6px;width:0;background:#f2c94c;border-radius:3px"></div></div>`;
  document.body.append(veil);
  const progress = f => { veil.querySelector("#veilBar").style.width = `${Math.round(f * 100)}%`; };
  await tl.load(f => progress(f * 0.6));
  veil.querySelector("#veilTxt").textContent = "Przygotowanie ujęć…";
  const renderer = ctx.renderer;
  for (const [i, b] of beats.entries()) {
    for (const f of [0.05, 0.6]) { const T = b.start + b.dur * f; render(tl.evaluate(T), T); renderer.compile(scene, camera); composer.render(); }
    if (i % 4 === 0) { progress(0.6 + 0.4 * i / beats.length); await new Promise(r => setTimeout(r, 0)); }
  }
  tl.seek(0); render(tl.evaluate(0), 0);
  veil.remove();

  (window.__frameHooks = window.__frameHooks || []).push(hook);
  addEventListener("pointerdown", () => snd.unlock(), { once: true });
  window.__demo = { tl, render, man, inst, handsMan, handsInst, kestrel, rifle, gong, GC, fp, PRONE, KNEEL, eyeW, SHOTS, pathAt };
}

// ---------- rear bag ----------
function woodlandCanvas(n = 512) {
  const c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d");
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "#a99c6c"; g.fillRect(0, 0, n, n);                       // tan base
  for (const [col, count, size] of [["#6f7c43", 26, 0.16], ["#4c3a28", 22, 0.12], ["#3b4a2a", 20, 0.11], ["#1d1d1b", 26, 0.05]]) {
    g.fillStyle = col;
    for (let i = 0; i < count; i++) {                                    // irregular blobs, stretched diagonally like woodland/DPM
      const x = rnd() * n, y = rnd() * n, r = size * n * (0.6 + rnd() * 0.8), a = rnd() * Math.PI;
      g.beginPath();
      for (let k = 0; k <= 14; k++) { const t = k / 14 * Math.PI * 2, rr = r * (0.55 + 0.45 * rnd()), ex = Math.cos(t) * rr * 1.7, ey = Math.sin(t) * rr * 0.6;
        const px = x + ex * Math.cos(a) - ey * Math.sin(a), py = y + ex * Math.sin(a) + ey * Math.cos(a); k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath(); g.fill();
      for (const dx of [-n, n]) { g.save(); g.translate(dx, 0); g.fill(); g.restore(); }   // wrap left/right
    }
  }
  g.globalAlpha = 0.08; for (let y = 0; y < n; y += 3) { g.fillStyle = y % 6 ? "#fff" : "#000"; g.fillRect(0, y, n, 1); }   // ripstop weave
  return c;
}
function makeBag(THREE, need) {
  // a soft, part-filled sack lying flat (author, 18 XI: not a balloon): flat top falling off only near the seams, sides
  // slumping outwards at mid-height, a groove along the middle where the stock has sunk in with the cloth bulging either
  // side, small creases; it is as thick as the butt needs plus the depth of the groove
  const DENT = 0.022, GROOVE = 0.03, L = 0.22, Wd = 0.15, T = need + DENT;
  const geo = new THREE.BoxGeometry(L, T, Wd, 28, 6, 20), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x) / (L / 2), az = Math.abs(z) / (Wd / 2), hy = y / (T / 2);
    const edge = Math.max(0.2, Math.min(1, (1 - Math.pow(ax, 8)) * (1 - Math.pow(az, 6))));
    let ny = hy > 0 ? y * edge : y;                                                             // the bottom rests flat
    if (hy > 0.99) {
      const gz = Math.abs(z) / GROOVE, along = 1 - Math.pow(ax, 6);
      ny -= DENT * along * Math.max(0, 1 - gz * gz);                                            // the stock's groove
      ny += 0.006 * along * Math.exp(-Math.pow((Math.abs(z) - GROOVE * 1.25) / 0.012, 2));      // cloth pushed up beside it
      ny += 0.0015 * Math.sin(x * 140 + z * 35) * Math.sin(z * 90) * edge;                      // creases
    }
    const bulge = 1 + 0.07 * (1 - hy * hy);                                                      // sides slump out
    p.setX(i, x * bulge); p.setZ(i, z * bulge); p.setY(i, ny + T / 2);
  }
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(woodlandCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(0.6, 0.6);
  const pillow = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })); pillow.castShadow = pillow.receiveShadow = true;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 16), new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.9 }));
  loop.position.set(-L / 2 - 0.008, 0.02, Wd / 2 - 0.02); loop.rotation.x = Math.PI / 2;
  const mid = new THREE.Group(); mid.rotation.y = Math.PI / 2; mid.add(pillow, loop);   // long side along the rifle (group +Z = forward)
  const g = new THREE.Group(); g.add(mid); g.userData.onSide = false; return g;
}

