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
