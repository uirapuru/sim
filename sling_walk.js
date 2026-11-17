// Test scene: a soldier walks a patrol line at Kijewo with the SpKW/Z (Grot 7,62N) slung diagonally across the chest
// on a two-point sling: stock up at the right shoulder, muzzle down to the left, ejection port facing out. The right
// hand holds the pistol grip (two-bone IK on the right arm every frame, fingers curled); the left arm keeps the walk
// cycle. The rifle is parented to the upper spine, so it moves with the torso; the sling is rebuilt every frame from
// the front sling point over the left shoulder, across the back, under the right arm to the stock.
//
// Open: index.html?scene=sling  (or the "Marsz z Grotem" button). Camera keys: 1 side, 2 front, 3 chest close-up,
// 4 orbit (default); window.__sling exposes the live objects for tuning.

let running = false;

// rifle-local points (glTF axes: x = rifle's right, y = up, z = -forward; origin = rear of the butt pad, bore at y = 0)
const R = {
  grip: [0.0, -0.095, -0.318],          // centre of the pistol grip
  wrist: [0.030, -0.100, -0.262],       // where the wrist sits when the hand wraps the grip from the right side
  fingers: [-0.022, -0.118, -0.352],    // knuckles aim here: around the front of the grip to the rifle's left side
  frontSling: [-0.026, -0.0, -0.850],   // QD socket at the handguard front (left side)
  rearSling: [0.0, -0.02, -0.195],      // sling loop at the stock hinge
};

export async function play(ctx, opts = {}) {
  if (running) return;
  running = true;
  const { THREE, scene, camera, hAt, meta, FIRE, gltf, clips, SkeletonUtils, GLTFLoader, mixers } = ctx;
  const hooks = (window.__frameHooks = window.__frameHooks || []);
  const V = (a, b, c) => new THREE.Vector3(a, b, c);

  // ---- only this soldier in the scene: hide every other character already placed (firing line, stand, walker) ----
  for (const o of [...scene.children]) {
    let skinned = false; o.traverse(c => { if (c.isSkinnedMesh) skinned = true; });
    if (skinned) o.visible = false;
  }
  window.__walker = null;                                    // stop the patrol walker loop in index.html

  // ---- soldier ----
  const man = SkeletonUtils.clone(gltf.scene);
  man.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  scene.add(man);
  const mixer = new THREE.AnimationMixer(man); mixers.push(mixer);
  const clipName = opts.clip || "Walking";
  const act = mixer.clipAction(clips[clipName] || clips.Casual_Walk); act.play();
  const bone = n => { let b = null; man.traverse(o => { if (!b && o.name.replace(/^mixamorig:?/, "") === n) b = o; }); return b; };
  const B = Object.fromEntries(["Hips", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "RightHandMiddle1"].map(n => [n, bone(n)]));

  // patrol line behind the firing point, parallel to it
  const fp = meta.positions.firing_point, side = V(-FIRE.y, 0, FIRE.x).normalize(), back = V(-FIRE.x, 0, -FIRE.y).normalize();
  const A = V(fp[0], 0, fp[2]).addScaledVector(back, 14).addScaledVector(side, -18);
  const Bp = V(fp[0], 0, fp[2]).addScaledVector(back, 14).addScaledVector(side, 18);
  const L = A.distanceTo(Bp), SPEED = opts.speed || 1.35;
  let t = 0;
  const place = () => {
    const f = t < 1 ? t : 2 - t, dir = (t < 1 ? Bp.clone().sub(A) : A.clone().sub(Bp)).normalize();
    const p = A.clone().lerp(Bp, f); p.y = hAt(p.x, p.z);
    man.position.copy(p); man.rotation.y = Math.atan2(dir.x, dir.z);
  };
  place(); mixer.update(0); man.updateMatrixWorld(true);

  // ---- rifle (built Grot model with the PM II and the folded bipod) ----
  const rifle = (await new GLTFLoader().loadAsync("models/grot.glb")).scene;
  rifle.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; if (o.name === "bipod_deployed") o.visible = false; });

  // Pose on the chest, defined in the soldier's own frame (x = his left, y = up, z = forward), measured from bones
  // in the first frame: grip in front of the right lower ribs, muzzle down-left, rail up-left, ejection port out.
  const inv = man.matrixWorld.clone().invert();
  const local = b => b.getWorldPosition(V(0, 0, 0)).applyMatrix4(inv);
  const hips = local(B.Hips), chest = local(B.Spine2), rSh = local(B.RightArm), lSh = local(B.LeftArm);
  const shoulderW = rSh.distanceTo(lSh);
  const muzzleDir = V(0.62, -0.76, opts.muzzleOut ?? 0.03).normalize();        // rifle -Z axis, nearly in the chest plane
  const railUp = V(0.77, 0.64, 0).sub(muzzleDir.clone().multiplyScalar(V(0.77, 0.64, 0).dot(muzzleDir))).normalize();
  const rightSide = muzzleDir.clone().cross(railUp).normalize();                 // rifle +X (port side) -> out
  const basis = new THREE.Matrix4().makeBasis(rightSide, railUp, muzzleDir.clone().negate());
  const gripAt = hips.clone().lerp(chest, opts.gripHeight ?? 0.45);             // between hips and chest...
  gripAt.x = rSh.x * (opts.gripSide ?? 0.62);                                   // ...on the right side of the body
  gripAt.z = chest.z + shoulderW * (opts.gripOut ?? 0.5);                       // in front of the plate carrier
  const q = new THREE.Quaternion().setFromRotationMatrix(basis);
  const pos = gripAt.clone().sub(V(...R.grip).applyQuaternion(q));
  const rifleInMan = new THREE.Matrix4().compose(pos, q, V(1, 1, 1));
  const rifleWorld = man.matrixWorld.clone().multiply(rifleInMan);
  B.Spine2.updateMatrixWorld(true);
  const inSpine = B.Spine2.matrixWorld.clone().invert().multiply(rifleWorld);
  B.Spine2.add(rifle); inSpine.decompose(rifle.position, rifle.quaternion, rifle.scale);

  // ---- sling: flat strap through points that follow the body ----
  const slingMat = new THREE.MeshStandardMaterial({ color: 0x3d3a2a, roughness: 0.9 });
  let sling = null;
  const bodyPt = (b, x, y, z) => b.localToWorld(V(x, y, z));
  const sc = 1 / B.Spine2.getWorldScale(V(0, 0, 0)).x;                          // bone units -> metres
  function rebuildSling() {
    const w = s => s * sc;
    const pts = [
      rifle.localToWorld(V(...R.frontSling)),
      bodyPt(B.LeftArm, 0, w(0.07), w(0.09)), bodyPt(B.LeftShoulder, 0, w(0.10), w(0.0)),       // up over the left shoulder
      bodyPt(B.Spine2, w(0.02), w(0.06), w(-0.16)), bodyPt(B.Spine1, w(-0.15), w(-0.02), w(-0.12)),  // across the back
      bodyPt(B.RightArm, w(-0.02), w(-0.13), w(-0.02)),                                         // under the right arm
      rifle.localToWorld(V(...R.rearSling)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const g = new THREE.TubeGeometry(curve, 80, 0.011, 4, false);
    g.scale(1, 1, 1);
    if (sling) { sling.geometry.dispose(); sling.geometry = g; }
    else { sling = new THREE.Mesh(g, slingMat); sling.castShadow = true; scene.add(sling); sling.scale.set(1, 1, 1); }
  }

  // ---- right arm IK: wrist to the grip, elbow out and back, palm around the grip ----
  const tmpQ = new THREE.Quaternion(), pq = new THREE.Quaternion();
  function aim(b, child, target) {             // rotate bone b so that its child points at target (world)
    const bp = b.getWorldPosition(V(0, 0, 0)), cp = child.getWorldPosition(V(0, 0, 0));
    const from = cp.sub(bp).normalize(), to = target.clone().sub(bp).normalize();
    tmpQ.setFromUnitVectors(from, to);
    b.getWorldQuaternion(pq); const nw = tmpQ.multiply(pq);
    b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true);
  }
  const curl = [];
  man.traverse(o => { const m = o.name.match(/RightHand(Index|Middle|Ring|Pinky)([123])$/); if (m) curl.push([o, m[2] === "1" ? 1.15 : 1.25]); });
  const thumb = []; man.traverse(o => { const m = o.name.match(/RightHandThumb([23])$/); if (m) thumb.push(o); });
  const curlAxis = V(...(opts.curlAxis || [0, 0, 1])), thumbAxis = V(...(opts.thumbAxis || [0, 0, 1]));
  function solveArm() {
    man.updateMatrixWorld(true);
    const S = B.RightArm.getWorldPosition(V(0, 0, 0));
    const Tw = rifle.localToWorld(V(...R.wrist));
    const a = S.distanceTo(B.RightForeArm.getWorldPosition(V(0, 0, 0)));
    const b = B.RightForeArm.getWorldPosition(V(0, 0, 0)).distanceTo(B.RightHand.getWorldPosition(V(0, 0, 0)));
    const toT = Tw.clone().sub(S); const d = Math.min(toT.length(), (a + b) * 0.999); toT.normalize();
    // elbow: out to the right and back from the shoulder-wrist line
    const up = V(0, 1, 0).applyQuaternion(man.quaternion), fwd = V(0, 0, 1).applyQuaternion(man.quaternion);
    const right = fwd.clone().cross(up).normalize();                          // soldier's right (-X in his frame)
    const pole = right.multiplyScalar(0.8).addScaledVector(fwd, -0.6).addScaledVector(up, -0.2);
    const n = pole.sub(toT.clone().multiplyScalar(pole.dot(toT))).normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = S.clone().addScaledVector(toT, a * cosA).addScaledVector(n, a * sinA);
    aim(B.RightArm, B.RightForeArm, elbow);
    aim(B.RightForeArm, B.RightHand, S.clone().addScaledVector(toT, d));
    // hand: fingers (wrist -> middle knuckle) along the grip, wrapping toward the rifle's left side
    aim(B.RightHand, B.RightHandMiddle1, rifle.localToWorld(V(...R.fingers)));
    for (const [o, k] of curl) { o.quaternion.setFromAxisAngle(curlAxis, k); }
    for (const o of thumb) { o.quaternion.setFromAxisAngle(thumbAxis, 0.5); }
    man.updateMatrixWorld(true);
  }

  // ---- camera ----
  let camMode = opts.cam || "orbit", camT = 0;
  addEventListener("keydown", e => { const m = { Digit1: "side", Digit2: "front", Digit3: "close", Digit4: "orbit" }[e.code]; if (m) camMode = m; });
  window.__camOverride = true;
  function placeCamera(dt) {
    camT += dt;
    const c = B.Spine1.getWorldPosition(V(0, 0, 0));
    const fwd = V(0, 0, 1).applyQuaternion(man.quaternion), right = V(0, 1, 0).cross(fwd).normalize().negate();
    let off;
    if (camMode === "side") off = right.clone().multiplyScalar(-3.2).addScaledVector(fwd, 0.4).add(V(0, 0.3, 0));
    else if (camMode === "front") off = fwd.clone().multiplyScalar(3.4).addScaledVector(right, 0.8).add(V(0, 0.4, 0));
    else if (camMode === "close") off = fwd.clone().multiplyScalar(0.75).addScaledVector(right, 0.55).add(V(0, -0.1, 0));
    else { const a = camT * 0.25; off = fwd.clone().multiplyScalar(Math.cos(a) * 3.6).addScaledVector(right, Math.sin(a) * 3.6).add(V(0, 0.6, 0)); }
    if (camMode === "grip") {                                                   // square to the rifle's right side
      const rq = rifle.getWorldQuaternion(new THREE.Quaternion()), gp = rifle.localToWorld(V(...R.grip));
      camera.position.copy(gp).add(V(0.5, 0.06, 0.05).applyQuaternion(rq)); camera.lookAt(gp); return;
    }
    const look = camMode === "close" ? rifle.localToWorld(V(...R.grip)) : c.clone().add(V(0, 0.1, 0));
    camera.position.copy(camMode === "close" ? look : c).add(off);
    const g = hAt(camera.position.x, camera.position.z) + 0.3; if (camera.position.y < g) camera.position.y = g;
    camera.lookAt(look);
  }

  const hook = dt => {
    if (!opts.frozen) { t = (t + dt * SPEED / L) % 2; place(); }
    solveArm(); rebuildSling(); placeCamera(dt);
  };
  hooks.push(hook);
  window.__sling = { man, rifle, mixer, act, B, R, opts, setCam: m => camMode = m, solveArm, rebuildSling, stop: () => { hooks.splice(hooks.indexOf(hook), 1); window.__camOverride = false; running = false; } };
}
