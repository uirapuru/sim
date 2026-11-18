// Pose helpers for the Meshy/Mixamo soldier: two-bone arm IK (wrist to a point, elbow towards a pole, knuckles
// towards a second point), head look-at and simple finger curl. All targets are world positions.

export function makeRig(THREE, man) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const find = n => { let b = null; man.traverse(o => { if (!b && o.name.replace(/^mixamorig:?/, "") === n) b = o; }); return b; };
  const names = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "LeftHandMiddle1",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand", "RightHandMiddle1", "RightHandIndex1", "RightHandIndex2", "RightHandIndex3"];
  const B = Object.fromEntries(names.map(n => [n, find(n)]));
  const fingers = { L: [], R: [] }, thumbs = { L: [], R: [] };
  man.traverse(o => {
    const m = o.name.match(/(Left|Right)Hand(Index|Middle|Ring|Pinky)([123])$/);
    if (m) fingers[m[1][0]].push({ o, finger: m[2], seg: +m[3] });
    const t = o.name.match(/(Left|Right)HandThumb([23])$/); if (t) thumbs[t[1][0]].push(o);
  });
  const tq = new THREE.Quaternion(), pq = new THREE.Quaternion();
  const wp = o => o.getWorldPosition(V());

  function aim(b, child, target) {                 // rotate b so that child lies on the line b -> target
    const bp = wp(b), from = wp(child).sub(bp).normalize(), to = target.clone().sub(bp).normalize();
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    tq.setFromUnitVectors(from, to);
    b.getWorldQuaternion(pq); const nw = tq.clone().multiply(pq);
    b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true);
  }

  // side "R" | "L"; wrist: world point; knuckles: world point the hand should point at (optional);
  // pole: world direction the elbow bends towards (optional, default: out to the side and down)
  function arm(side, wrist, knuckles, pole) {
    const P = side === "R" ? "Right" : "Left";
    const up = B[`${P}Arm`], fore = B[`${P}ForeArm`], hand = B[`${P}Hand`], mid = B[`${P}HandMiddle1`];
    man.updateMatrixWorld(true);
    const S = wp(up), a = S.distanceTo(wp(fore)), b = wp(fore).distanceTo(wp(hand));
    const toT = wrist.clone().sub(S); const d = Math.min(toT.length(), (a + b) * 0.999); toT.normalize();
    let pl = pole ? pole.clone() : (() => {
      const q = man.getWorldQuaternion(new THREE.Quaternion());
      const out = V(side === "R" ? -1 : 1, 0, 0).applyQuaternion(q);     // soldier's right = -X in his frame
      return out.multiplyScalar(0.8).add(V(0, -0.5, 0)).add(V(0, 0, -0.3).applyQuaternion(q));
    })();
    pl.sub(toT.clone().multiplyScalar(pl.dot(toT)));
    if (pl.lengthSq() < 1e-8) pl = V(0, -1, 0); pl.normalize();
    const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))), sinA = Math.sqrt(1 - cosA * cosA);
    const elbow = S.clone().addScaledVector(toT, a * cosA).addScaledVector(pl, a * sinA);
    aim(up, fore, elbow);
    aim(fore, hand, S.clone().addScaledVector(toT, d));
    if (knuckles && mid) aim(hand, mid, knuckles);
    man.updateMatrixWorld(true);
  }

  // turn neck and head (split 40/60) so the face points at target; weight 0..1
  function look(target, weight = 1) {
    for (const [b, w] of [[B.Neck, 0.4], [B.Head, 0.6]]) {
      if (!b) continue;
      const fwd = V(0, 0, 1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
      const to = target.clone().sub(wp(b)).normalize();
      tq.setFromUnitVectors(fwd, to);
      const part = new THREE.Quaternion().slerp(tq, w * weight);
      b.getWorldQuaternion(pq); const nw = part.multiply(pq);
      b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true);
    }
  }

  // curl fingers of a hand (0 open .. 1 fist); trigger: index finger straight-ish (on the trigger)
  const CURL_AXIS = V(0, 0, 1);
  function curl(side, amount, { indexOn = false } = {}) {
    for (const f of fingers[side]) {
      let k = amount * (f.seg === 1 ? 1.2 : 1.35);
      if (f.finger === "Index" && indexOn) k = f.seg === 1 ? 0.5 : 0.6;
      f.o.quaternion.setFromAxisAngle(CURL_AXIS, side === "R" ? k : -k);
    }
    for (const t of thumbs[side]) t.quaternion.setFromAxisAngle(CURL_AXIS, (side === "R" ? 1 : -1) * amount * 0.5);
    man.updateMatrixWorld(true);
  }
  // bend the torso forward by angle (rad), spread over the three spine bones (kneeling work over a rifle on the ground)
  function bend(angle) {
    if (!angle) return;
    const axis = V(1, 0, 0).applyQuaternion(man.getWorldQuaternion(new THREE.Quaternion()));   // soldier's left = +X: +angle leans forward
    for (const b of [B.Spine, B.Spine1, B.Spine2]) {
      if (!b) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle / 3);
      b.getWorldQuaternion(pq); const nw = q.multiply(pq);
      b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true);
    }
  }
  // lean from the lower back with the upper back kept straight: the lowest spine bone takes the angle, the upper ones
  // are turned back by straighten (rad) so a rounded clip pose becomes a flatter, hinged back
  function hinge(angle, straighten = 0) {
    const axis = V(1, 0, 0).applyQuaternion(man.getWorldQuaternion(new THREE.Quaternion()));
    for (const [b, a] of [[B.Spine, angle + straighten], [B.Spine1, -straighten * 0.55], [B.Spine2, -straighten * 0.45]]) {
      if (!b || !a) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, a);
      b.getWorldQuaternion(pq); const nw = q.multiply(pq);
      b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true);
    }
  }
  // put the eye (headfront marker) on a point by turning the neck, then turn the head alone to face along dir
  // (cheek weld: eye behind the eyepiece, face along the line of sight)
  const front = (() => { let f = null; man.traverse(o => { if (!f && o.name === "headfront") f = o; }); return f; })();
  function eyeTo(point, dir) {
    if (!front || !B.Neck || !B.Head) return;
    man.updateMatrixWorld(true);
    aim(B.Neck, front, point);
    const fwd = V(0, 0, 1).applyQuaternion(B.Head.getWorldQuaternion(new THREE.Quaternion()));
    tq.setFromUnitVectors(fwd, dir.clone().normalize());
    B.Head.getWorldQuaternion(pq); const nw = tq.clone().multiply(pq);
    B.Head.parent.getWorldQuaternion(pq); B.Head.quaternion.copy(pq.invert().multiply(nw)); B.Head.updateMatrixWorld(true);
    aim(B.Neck, front, point);                                   // the head turn moved the eye a little: settle it again
  }
  return { B, arm, look, curl, bend, hinge, eyeTo, wp };
}
