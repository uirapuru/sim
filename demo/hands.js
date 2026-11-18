// Gloved hands with real fingers, replacing the mitten of the Meshy soldier.
// The original hand is collapsed into the wrist every frame (hand bone scaled to ~0 after the pose is final) and a
// procedural hand is drawn in its place in the hand bone's frame: cuff, back of the hand / palm, five fingers with three
// phalanges each. Measured on the rig: fingers run along +y, the index side is +z, the palm faces -x (right hand) and
// +x (left hand); phalanx lengths 15-23 mm. The right glove is cut half-way along the index finger (bare fingertip on
// the trigger), as tactical shooting gloves are.

const FINGERS = {            // base (hand-local, y along the fingers, z towards the index), phalanx lengths, radius
  Index:  { base: [0, 0.120, 0.024],  len: [0.024, 0.021, 0.019], r: 0.0088 },
  Middle: { base: [0, 0.122, 0.004],  len: [0.026, 0.023, 0.020], r: 0.0092 },
  Ring:   { base: [0, 0.115, -0.015], len: [0.024, 0.021, 0.019], r: 0.0087 },
  Pinky:  { base: [0, 0.104, -0.031], len: [0.019, 0.017, 0.016], r: 0.0076 },
};

export function makeHands(THREE, soldier, { cutIndex = { R: true, L: false }, glove = 0x3a3d2b } = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const gloveM = new THREE.MeshStandardMaterial({ color: glove, roughness: 0.85 });
  const palmM = new THREE.MeshStandardMaterial({ color: 0x24261c, roughness: 0.9 });           // darker synthetic-leather palm
  const skinM = new THREE.MeshStandardMaterial({ color: 0xc69a7c, roughness: 0.6 });
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1), sph = new THREE.SphereGeometry(1, 12, 8);
  const scene = soldier.m.parent;
  const hands = {};
  for (const side of ["R", "L"]) {
    const P = side === "R" ? "Right" : "Left", palmDir = side === "R" ? -1 : 1;              // palm normal along x
    const bone = soldier.rig.B[`${P}Hand`];
    const g = new THREE.Group(); g.matrixAutoUpdate = false; scene.add(g);
    // cuff and the back of the hand
    const cuff = new THREE.Mesh(cyl, gloveM); cuff.scale.set(0.034, 0.05, 0.034); cuff.position.y = 0.0; g.add(cuff);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.07, 2, 3, 2), gloveM);
    { const p = back.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); p.setX(i, p.getX(i) * (1 - 0.35 * (z / 0.035) ** 2)); p.setZ(i, z * (0.9 + 0.1 * (y + 0.05) / 0.1)); } back.geometry.computeVertexNormals(); }
    back.position.set(0, 0.07, -0.003); g.add(back);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.085, 0.062), palmM); palm.position.set(palmDir * 0.015, 0.075, -0.003); g.add(palm);
    // fingers: per phalanx a cylinder and a joint sphere; the right index finger is bare from half-way along phalanx 2
    const fingers = {};
    for (const [name, f] of Object.entries(FINGERS)) {
      const segs = [];
      for (let k = 0; k < 3; k++) {
        const bare = cutIndex[side] && name === "Index" && k >= 1;
        const meshes = [];
        if (bare && k === 1) {            // phalanx 2: glove on the first half, skin on the second
          meshes.push(new THREE.Mesh(cyl, gloveM), new THREE.Mesh(cyl, skinM));
        } else meshes.push(new THREE.Mesh(cyl, bare ? skinM : gloveM));
        const joint = new THREE.Mesh(sph, bare && k === 2 ? skinM : gloveM);
        meshes.forEach(m => g.add(m)); g.add(joint); segs.push({ meshes, joint });
      }
      const tip = new THREE.Mesh(sph, cutIndex[side] && name === "Index" ? skinM : gloveM); g.add(tip);
      fingers[name] = { ...f, segs, tip };
    }
    // thumb: three phalanges from the base of the palm, towards the index side and the palm
    const thumb = { base: [palmDir * 0.012, 0.035, 0.022], dir: V(palmDir * 0.35, 0.82, 0.45).normalize(), len: [0.026, 0.022, 0.02], r: 0.0098, segs: [] };
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(cyl, gloveM), j = new THREE.Mesh(sph, gloveM); g.add(m, j); thumb.segs.push({ meshes: [m], joint: j }); }
    thumb.tip = new THREE.Mesh(sph, gloveM); g.add(thumb.tip);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    hands[side] = { bone, g, fingers, thumb, palmDir };
  }

  const up = V(0, 1, 0), q = new THREE.Quaternion();
  function place(mesh, a, b, r) { const d = b.clone().sub(a), L = d.length(); mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(up, d.normalize()); mesh.scale.set(r, L, r); }
  function chain(f, start, dir0, axis, angles) {
    let p = V(...start), d = dir0.clone();
    for (let k = 0; k < 3; k++) {
      d.applyQuaternion(q.setFromAxisAngle(axis, angles[k]));
      const n = p.clone().addScaledVector(d, f.len[k]), s = f.segs[k];
      if (s.meshes.length === 2) { const mid = p.clone().lerp(n, 0.5); place(s.meshes[0], p, mid, f.r); place(s.meshes[1], mid, n, f.r * 0.92); }
      else place(s.meshes[0], p, n, f.r * (s.meshes[0].material.color.getHex() === 0xc69a7c ? 0.92 : 1));
      s.joint.position.copy(p); s.joint.scale.setScalar(f.r * 1.05);
      p = n;
    }
    f.tip.position.copy(p); f.tip.scale.setScalar(f.r * 0.98);
  }

  // pose: { R: { curl 0..1, index 0..1, thumb 0..1 }, L: {...} }; call after IK and after anything that reads the
  // finger bones (props held in the hand), because the original hand is collapsed here
  function update(pose) {
    for (const side of ["R", "L"]) {
      const h = hands[side], p = pose[side] || { curl: 0.3 };
      h.bone.updateMatrixWorld(true);
      h.g.matrix.copy(h.bone.matrixWorld); h.g.updateMatrixWorld(true);
      const curlAxis = V(0, 0, h.palmDir < 0 ? 1 : -1);     // rotates +y towards the palm
      for (const [name, f] of Object.entries(h.fingers)) {
        const c = name === "Index" && p.index != null ? p.index : p.curl;
        chain(f, f.base, V(0, 1, 0), curlAxis, [c * 1.35, c * 1.55, c * 1.05]);
      }
      const t = p.thumb ?? p.curl * 0.8, ta = V().crossVectors(h.thumb.dir, V(h.palmDir, 0, 0)).normalize();
      chain(h.thumb, h.thumb.base, h.thumb.dir, ta, [t * 0.5, t * 0.6, t * 0.5]);
      h.bone.scale.setScalar(0.001); h.bone.updateMatrixWorld(true);   // hide the mitten (restored with the next clean pose)
    }
  }
  const handPoint = (side, x = 0, y = 0.09, z = 0) => hands[side].g.localToWorld(V(x, y, z));
  return { update, handPoint, hands };
}

// Bought gloved hands (models/gloves.glb, CGTrader "FPS Glove Tactical 4", olive; the right glove is cut on the index
// fingertip with bare skin under it). One skinned model per soldier: the DEF-hand bone of each side is taken off its
// forearm and driven every frame from the soldier's hand bone; the fingers are rotated from script. Same interface as
// makeHands: update(pose) after the IK, handPoint(side, x, y, z) in the hand bone frame, hands[side].g.visible.
export function makeGloves(THREE, soldier, gltfScene, { clone } = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const root = clone ? clone(gltfScene) : gltfScene, scene = soldier.m.parent;
  scene.add(root); root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true;
    if (/anatomy/.test(o.name)) o.material = new THREE.MeshStandardMaterial({ color: 0xc69a7c, roughness: 0.55 }); } });   // bare fingertip
  // the bought rig gives the glove's index finger near the cut some weight on the middle finger, so with the middle
  // finger round the grip the glove end left the bare fingertip (author, 18 XI): glove vertices of the index finger
  // close to the fingertip take the weights of the nearest fingertip vertex and move with it
  { let tip = null; const gl = []; root.traverse(o => { if (o.isSkinnedMesh) (/anatomy/.test(o.name) ? tip = o : gl.push(o)); });
    if (tip) { const ta = tip.geometry.attributes, tp = ta.position, v = V(), w = V();
      tip.geometry.computeBoundingBox(); const tb = tip.geometry.boundingBox, reach = tb.getSize(V()).length() * 0.15;
      for (const g of gl) { const map = tip.skeleton.bones.map(b => g.skeleton.bones.indexOf(b)); if (map.some(i => i < 0)) continue;   // same bones, maybe another order
        const ga = g.geometry.attributes, idx = new Set(g.skeleton.bones.map((b, i) => /index/.test(b.name) ? i : -1).filter(i => i >= 0));
        const box = tb.clone().expandByScalar(reach);
        for (let i = 0; i < ga.position.count; i++) { v.fromBufferAttribute(ga.position, i); if (!box.containsPoint(v)) continue;
          let wi = 0; for (let k = 0; k < 4; k++) if (idx.has(ga.skinIndex.getComponent(i, k))) wi += ga.skinWeight.getComponent(i, k);
          if (wi < 0.5) continue;                                     // the middle finger's own glove stays as it is
          let best = -1, bd = Infinity; for (let j = 0; j < tp.count; j++) { const d = w.fromBufferAttribute(tp, j).distanceToSquared(v); if (d < bd) { bd = d; best = j; } }
          if (Math.sqrt(bd) > reach) continue;
          for (let k = 0; k < 4; k++) { ga.skinIndex.setComponent(i, k, map[ta.skinIndex.getComponent(best, k)]); ga.skinWeight.setComponent(i, k, ta.skinWeight.getComponent(best, k)); } }
        ga.skinIndex.needsUpdate = ga.skinWeight.needsUpdate = true; } } }
  const find = n => { let b = null; root.traverse(o => { if (!b && o.name.replace(/[.\s_]/g, "") === n.replace(/[.\s_]/g, "")) b = o; }); return b; };
  const hands = {};
  for (const side of ["R", "L"]) {
    const P = side === "R" ? "Right" : "Left", s = "." + side;
    const bone = soldier.rig.B[`${P}Hand`], mid = soldier.rig.B[`${P}HandMiddle1`];
    const wrist = find("DEF-hand" + s), fing = {};
    for (const f of ["index", "middle", "ring", "pinky"]) fing[f] = [1, 2, 3].map(k => find(`DEF-f_${f}.0${k}${s}`));
    fing.thumb = [1, 2, 3].map(k => find(`DEF-thumb.0${k}${s}`));
    // source frame of the bought hand at rest: y along the fingers, z towards the index finger
    const W = wrist.getWorldPosition(V()), y = fing.middle[0].getWorldPosition(V()).sub(W);
    const lenSrc = y.length(); y.normalize();
    const z = fing.index[0].getWorldPosition(V()).sub(fing.pinky[0].getWorldPosition(V())); z.addScaledVector(y, -z.dot(y)).normalize();
    const x = V().crossVectors(y, z), Rsrc = new THREE.Matrix4().makeBasis(x, y, z);
    const rest = wrist.matrixWorld.clone().setPosition(0, 0, 0);
    // the soldier's hand frame, in its own (scaled) bone space: the same y/z meaning (measured for makeHands)
    soldier.m.updateMatrixWorld(true);
    const k = bone.getWorldScale(V()).x, lenDst = mid ? bone.getWorldPosition(V()).distanceTo(mid.getWorldPosition(V()))
      : bone.getWorldPosition(V()).distanceTo(bone.parent.getWorldPosition(V())) * 0.42;   // a rig without finger bones: wrist to knuckles ~0.42 forearm
    const local = new THREE.Matrix4().makeScale(lenDst / lenSrc / k, lenDst / lenSrc / k, lenDst / lenSrc / k).multiply(Rsrc.clone().transpose()).multiply(rest);
    const g = new THREE.Group(); g.matrixAutoUpdate = false; scene.add(g);
    g.attach(wrist); wrist.matrixAutoUpdate = true; local.decompose(wrist.position, wrist.quaternion, wrist.scale);
    const restQ = {}; for (const [f, bs] of Object.entries(fing)) restQ[f] = bs.map(b => b.quaternion.clone());
    hands[side] = { g, bone, fing, restQ };
  }
  Object.defineProperty(hands.R.g, "visible", { get: () => root.visible, set: v => { root.visible = v; hands.L.g.children.forEach(c => c.visible = v); } });
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), AX = V(1, 0, 0), AXZ = V(0, 0, 1);
  const pose = (h, f, angles) => h.fing[f].forEach((b, i) => b.quaternion.copy(h.restQ[f][i]).multiply(q.setFromAxisAngle(AX, angles[i])));
  function update(p) {
    for (const side of ["R", "L"]) {
      const h = hands[side], s = p[side] || { curl: 0.3 };
      if (h.bone.scale.x < 0.01) h.bone.scale.setScalar(1);       // a second update in the same frame: undo the collapse
      h.bone.updateMatrixWorld(true); h.g.matrix.copy(h.bone.matrixWorld); h.g.updateMatrixWorld(true);
      for (const f of ["index", "middle", "ring", "pinky"]) { const c = f === "index" && s.index != null ? s.index : s.curl; pose(h, f, [c * 1.45, c * 1.65, c * 1.1]); }
      if (s.gripA) for (const f of ["middle", "ring", "pinky"]) pose(h, f, s.gripA);   // explicit joint angles: wrapped around a grip
      if (s.indexA) pose(h, "index", s.indexA);                    // explicit index joint angles (trigger finger)
      if (s.indexUp) h.fing.index[0].quaternion.copy(h.restQ.index[0]).multiply(q.setFromAxisAngle(AXZ, s.indexUp)).multiply(q2.setFromAxisAngle(AX, s.indexA ? s.indexA[0] : (s.index ?? s.curl) * 1.45));   // index spread sideways
      const t = s.thumb ?? s.curl * 0.8; pose(h, "thumb", s.thumbA || [t * 0.35, t * 0.6, t * 0.6]);
      if (s.thumbUp) h.fing.thumb[0].quaternion.multiply(q.setFromAxisAngle(AXZ, s.thumbUp));          // thumb swung across (to a lever)
      h.g.updateMatrixWorld(true);
      h.bone.scale.setScalar(0.001); h.bone.updateMatrixWorld(true);   // hide the mitten (restored with the next clean pose)
    }
  }
  const handPoint = (side, x = 0, y = 0.09, z = 0) => hands[side].g.localToWorld(V(x, y, z));
  return { update, handPoint, hands };
}
