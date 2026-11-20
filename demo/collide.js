// Collision layer (trial, branch "collision"): after the animation has set a frame's pose, nothing may pass through
// anything else. Obstacles are the terrain and rigid props (rifle parts, the hand-held magazine, the rear bag; props put
// down are lifted onto the terrain); bodies are sampled from
// their skinned vertices (gloves every other vertex, the soldier every 12th). Penetrations are resolved the way a body would:
// fingers stop curling at the surface, a hand is pushed out (arm IK to the moved wrist, hand orientation kept), a leg
// is lifted at the hip or the knee, an elbow swings about the shoulder-wrist axis, and whatever is left lifts the
// whole soldier with his hands pinned where they were.
//
// Distances to a rigid part: the closest point on a BVH of its mesh (three-mesh-bvh), looked for only within ~1 cm;
// inside or outside by ray parity (the meshes are not all closed), cached on small grids in the part's frame.
// Measured on the whole scene 1 (18 XI): no penetration left in any sampled frame, ~17 ms per frame (median).
import { MeshBVH } from "../vendor/three-mesh-bvh/index.module.js";   // kept locally: works offline (vendor/README.md)

export function makeCollision(THREE, { hAt, margin = 0.0015 } = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const _p = V(), _q = V(), _n = V(), _d = V(), _hit = {}, _ray = new THREE.Ray(), _m = new THREE.Matrix4();
  const DIRS = [V(0.577, 0.577, 0.577), V(-0.707, 0.1, 0.7).normalize(), V(0.2, -0.9, 0.39).normalize()];
  const stats = { corners: 0, queries: 0, rays: 0 };

  // ---------- rigid obstacles ----------
  // root: an object tree; every mesh with real geometry becomes a part. skip(o) leaves a mesh out (decals, lights)
  // rootVisible: false when the root's visibility is a camera matter (the rifle is hidden in the scope view, and that
  // flag is set later in the frame than this pass), so only the parts' own flags count
  function solid(root, { skip = () => false, name = root.name, rootVisible = true } = {}) {
    const parts = [];
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || skip(o)) return;
      const g = o.geometry, n = g.attributes.position && g.attributes.position.count; if (!n || n < 8) return;
      if (!g.boundsTree) g.boundsTree = new MeshBVH(g);
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.userData.sdf) {
        g.userData.sdf = { min: g.boundingBox.min.clone().subScalar(0.05), map: new Map(), fine: new Map() };
      }
      parts.push({ o, g, inv: new THREE.Matrix4(), scale: 1, on: true, wbox: new THREE.Box3() });
    });
    return { name, root, parts, rootVisible };
  }
  const shown = (o, stop = null) => { for (let x = o; x && x !== stop; x = x.parent) if (!x.visible) return false; return true; };
  // once per frame after the obstacles are placed: world -> part frames, visibility
  function prepare(s) { s.root.updateMatrixWorld(true);
    for (const p of s.parts) { p.on = shown(p.o, s.rootVisible ? null : s.root); if (!p.on) continue; p.inv.copy(p.o.matrixWorld).invert(); p.scale = p.o.matrixWorld.getMaxScaleOnAxis();
      p.wbox.copy(p.g.boundingBox).applyMatrix4(p.o.matrixWorld); } }

  // inside or outside, by ray parity (majority of three rays); cached on a coarse grid, which is only asked for
  // points at least `reach` from the surface, where a whole cell has one sign
  const COARSE = 0.004, FINE = 0.0015;
  function insideFar(g, lp) {
    const sdf = g.userData.sdf, i = Math.floor((lp.x - sdf.min.x) / COARSE), j = Math.floor((lp.y - sdf.min.y) / COARSE), k = Math.floor((lp.z - sdf.min.z) / COARSE);
    const key = i + 4096 * (j + 4096 * k); let v = sdf.map.get(key); if (v !== undefined) return v;
    _q.set(sdf.min.x + (i + 0.5) * COARSE, sdf.min.y + (j + 0.5) * COARSE, sdf.min.z + (k + 0.5) * COARSE);
    let odd = 0; for (const dir of DIRS) { _ray.set(_q, dir); if (g.boundsTree.raycast(_ray, THREE.DoubleSide).length % 2) odd++; }
    v = odd >= 2; sdf.map.set(key, v); stats.corners++; return v;
  }
  const _tri = new THREE.Triangle(), _fa = V(), _fb = V(), _fc = V();
  // signed distance (part units) and the outward direction at a part-local point; within `reach` it is exact (closest
  // point on the BVH, sign from the face normal), further away it is only the sign (+-reach)
  function sdPart(g, lp, reach, dir) {
    const r = g.boundsTree.closestPointToPoint(lp, _hit, 0, reach);
    if (!r) { const ins = insideFar(g, lp); dir.set(0, 0, 0); return ins ? -reach : reach; }
    const idx = g.index, f = r.faceIndex * 3, a = idx ? idx.getX(f) : f, b = idx ? idx.getX(f + 1) : f + 1, c = idx ? idx.getX(f + 2) : f + 2, pos = g.attributes.position;
    _tri.set(_fa.fromBufferAttribute(pos, a), _fb.fromBufferAttribute(pos, b), _fc.fromBufferAttribute(pos, c)); _tri.getNormal(_n);
    dir.copy(lp).sub(r.point); const d = r.distance;
    // the face normal says inside: the meshes are not all closed and consistent, so check by ray parity at the point
    let inside = dir.dot(_n) < 0;
    // (closer than a grid cell: at the point itself; further: at the cell's centre and kept, so the answer never
    // depends on which point asked first)
    if (inside) { const sdf = g.userData.sdf, parity = q => { let odd = 0; for (const dv of DIRS) { _ray.set(q, dv); if (g.boundsTree.raycast(_ray, THREE.DoubleSide).length % 2) odd++; } stats.rays++; return odd >= 2; };
      if (d < FINE) inside = parity(lp);
      else { const i = Math.floor((lp.x - sdf.min.x) / FINE), j = Math.floor((lp.y - sdf.min.y) / FINE), k = Math.floor((lp.z - sdf.min.z) / FINE), key = i + 8192 * (j + 8192 * k);
        let v = sdf.fine.get(key); if (v === undefined) { v = parity(_q.set(sdf.min.x + (i + 0.5) * FINE, sdf.min.y + (j + 0.5) * FINE, sdf.min.z + (k + 0.5) * FINE)); sdf.fine.set(key, v); }
        inside = v; } }
    if (d < 1e-6) dir.copy(_n); else { dir.normalize(); if (inside) dir.negate(); }
    return inside ? -d : d;
  }

  // signed distance of a world point to the obstacles: out = { sd, n (world, pointing out), what }
  // reach: only parts within this distance are looked at (the field is not filled far from the surface)
  // cand: optional list of [solid, part] already culled for the group of points being asked about
  function sdWorld(p, solids, ground, out, reach = 0.01, cand = null) {
    out.sd = Infinity; out.what = null;
    if (ground) { const d = p.y - hAt(p.x, p.z); if (d < out.sd) { out.sd = d; out.n.set(0, 1, 0); out.what = "ground"; } }
    const list = cand || solids.flatMap(s => s.parts.map(pt => [s, pt]));
    for (const [s, pt] of list) {
      if (!pt.on) continue;
      _p.copy(p).applyMatrix4(pt.inv); const bb = pt.g.boundingBox, r = reach / pt.scale;
      if (_p.x < bb.min.x - r || _p.y < bb.min.y - r || _p.z < bb.min.z - r || _p.x > bb.max.x + r || _p.y > bb.max.y + r || _p.z > bb.max.z + r) continue;
      stats.queries++;
      const d = sdPart(pt.g, _p, r, _d), dw = d * pt.scale;
      if (dw < out.sd) { out.sd = dw; out.what = s.name + ":" + pt.o.name;
        if (_d.lengthSq() > 0) out.n.copy(_d).transformDirection(pt.o.matrixWorld);
        else out.n.copy(_p).sub(pt.g.boundingBox.getCenter(_q)).transformDirection(pt.o.matrixWorld);   // deep inside: out from the part's middle
      }
    }
    return out;
  }

  // ---------- sampled skinned bodies ----------
  // mesh: SkinnedMesh; keep(boneName) -> group name or null (vertex left out); stride: every n-th vertex
  function skin(mesh, { keep = () => "body", stride = 1 } = {}) {
    const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
    const idx = [], grp = [], names = [], gid = new Map();
    for (let i = 0; i < pos.count; i += stride) {
      let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const gn = keep(bones[best].name); if (!gn) continue;
      if (!gid.has(gn)) { gid.set(gn, names.length); names.push(gn); }
      idx.push(i); grp.push(gid.get(gn));
    }
    const n = idx.length, rest = new Float32Array(n * 3), J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
    const v = V();
    idx.forEach((i, a) => { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix); rest.set([v.x, v.y, v.z], a * 3);
      for (let k = 0; k < 4; k++) { J[a * 4 + k] = si.getComponent(i, k); W[a * 4 + k] = sw.getComponent(i, k); } });
    const groups = names.map((nm, gi) => ({ name: nm, items: idx.map((_, a) => a).filter(a => grp[a] === gi) }));
    return { mesh, n, rest, J, W, groups, byName: Object.fromEntries(groups.map(x => [x.name, x])), world: new Float32Array(n * 3), mats: bones.map(() => new THREE.Matrix4()) };
  }
  // world positions of the given items (all when omitted); the bones' world matrices must be current
  function skinUpdate(s, items) {
    const m = s.mesh, bones = m.skeleton.bones, inv = m.skeleton.boneInverses;
    for (let b = 0; b < bones.length; b++) s.mats[b].multiplyMatrices(bones[b].matrixWorld, inv[b]);
    const R = s.rest, Wd = s.world, run = a => {
      let x = 0, y = 0, z = 0; const rx = R[a * 3], ry = R[a * 3 + 1], rz = R[a * 3 + 2];
      for (let k = 0; k < 4; k++) { const w = s.W[a * 4 + k]; if (!w) continue; const e = s.mats[s.J[a * 4 + k]].elements;
        x += w * (e[0] * rx + e[4] * ry + e[8] * rz + e[12]); y += w * (e[1] * rx + e[5] * ry + e[9] * rz + e[13]); z += w * (e[2] * rx + e[6] * ry + e[10] * rz + e[14]); }
      // bindMatrixInverse then matrixWorld
      _q.set(x, y, z).applyMatrix4(m.bindMatrixInverse).applyMatrix4(m.matrixWorld); Wd[a * 3] = _q.x; Wd[a * 3 + 1] = _q.y; Wd[a * 3 + 2] = _q.z; };
    if (items) for (const a of items) run(a); else for (let a = 0; a < s.n; a++) run(a);
  }
  // worst violation among the items: { depth (> 0 = inside or closer than margin), at, n, what, item }
  const _o = { sd: 0, n: V(), what: null }, _w = V(), _box = new THREE.Box3();
  function worst(s, items, solids, ground, clear = margin, first = false) {   // first: stop at the first violation (a yes/no probe)
    const w = { depth: 0, at: V(), n: V(), sum: V(), what: null, item: -1, count: 0 };   // sum: normals weighted by depth
    // parts whose box meets the box of these points (grown by the reach): the rest cannot be near any of them
    _box.makeEmpty(); for (const a of items) _box.expandByPoint(_w.set(s.world[a * 3], s.world[a * 3 + 1], s.world[a * 3 + 2]));
    _box.expandByScalar(clear + 0.012); const cand = [];
    for (const so of solids) for (const pt of so.parts) if (pt.on && pt.wbox.intersectsBox(_box)) cand.push([so, pt]);
    if (!cand.length && ground) { let lo = Infinity; for (const a of items) lo = Math.min(lo, s.world[a * 3 + 1]); if (lo - hAt(_box.getCenter(_w).x, _w.z) > 0.5) return w; }
    for (const a of items) { _w.set(s.world[a * 3], s.world[a * 3 + 1], s.world[a * 3 + 2]);   // own vector: sdWorld uses _p
      sdWorld(_w, solids, ground, _o, clear + 0.01, cand); const d = clear - _o.sd;
      if (d > 0) { w.count++; w.sum.addScaledVector(_o.n, d); if (d > w.depth) { w.depth = d; w.at.copy(_w); w.n.copy(_o.n); w.what = _o.what; w.item = a; } if (first) break; } }
    return w;
  }

  // ---------- rigid bodies on the ground ----------
  // sample points of a rigid object (object-local), lifted so its lowest visible point is on the terrain
  function rigidSamples(root, max = 1500) {
    const out = []; root.updateMatrixWorld(true);
    root.traverse(o => { if (!o.isMesh || o.isSkinnedMesh) return; const pos = o.geometry.attributes.position; if (!pos) return;
      const st = Math.max(1, Math.floor(pos.count / 300)); const pts = []; for (let i = 0; i < pos.count; i += st) pts.push(V().fromBufferAttribute(pos, i));
      out.push({ o, pts }); });
    return out;
  }
  function liftOnGround(root, samples, clear = 0) {
    root.updateMatrixWorld(true); let low = Infinity;
    for (const { o, pts } of samples) { if (!shown(o, root)) continue; for (const p of pts) { _p.copy(p).applyMatrix4(o.matrixWorld); low = Math.min(low, _p.y - hAt(_p.x, _p.z) - clear); } }
    if (low < 0) { root.position.y -= low; root.updateMatrixWorld(true); }
    return low < 0 ? -low : 0;
  }

  return { solid, prepare, sdWorld, skin, skinUpdate, worst, rigidSamples, liftOnGround, stats, margin };
}

// ---------- the soldier ----------
// soldier: { m, rig } from scene1; gloves: makeGloves result (with .last pose); col: makeCollision
// Returns the residual violations after solving (for the report).
export function makeSoldierSolver(THREE, col, soldier, gloves, { bodyStride = 12 } = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const { rig } = soldier;
  // body skin: hands and fingers of the soldier are collapsed under the gloves, so they are left out
  let body = null; soldier.m.traverse(o => { if (o.isSkinnedMesh && !body) body = o; });
  const region = n => { n = n.replace(/^mixamorig:?/, "");
    if (/Hand/.test(n)) return null;
    const m = n.match(/^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End|Arm|ForeArm|Shoulder)$/);
    if (!m) return "core";
    const s = m[1][0]; if (m[2] === "UpLeg" || m[2] === "Leg") return "thigh" + s; if (/Foot|Toe/.test(m[2])) return "foot" + s;
    if (m[2] === "ForeArm" || m[2] === "Arm") return "arm" + s; return "core"; };
  const bodyS = body ? col.skin(body, { keep: region, stride: bodyStride }) : null;
  // gloves: one skinned mesh for both hands; groups per finger and side, the rest of the hand is the palm
  let gl = null; gloves.hands.R.g.parent.traverse(o => { if (o.isSkinnedMesh && !gl && o.skeleton.bones.includes(gloves.hands.R.fing.index[0]) && !/anatomy/.test(o.name)) gl = o; });
  const gloveRegion = n => { const m = n.match(/(f_index|f_middle|f_ring|f_pinky|thumb)0[123]([LR])$/); if (m) return m[2] + ":" + m[1].replace("f_", "");
    const h = n.match(/(hand|palm0[1-4])([LR])$/); return h ? h[2] + ":palm" : null; };
  const glS = gl ? col.skin(gl, { keep: gloveRegion, stride: 2 }) : null;   // every other vertex: ~2-3 mm apart
  const gloveMeshes = []; gloves.hands.R.g.parent.traverse(o => { if (o.isSkinnedMesh && o.skeleton.bones.includes(gloves.hands.R.fing.index[0])) gloveMeshes.push(o); });
  const tipS = gloveMeshes.filter(o => o !== gl).map(o => col.skin(o, { keep: gloveRegion }));   // the bare fingertip

  const B = n => soldier.m.getObjectByName("mixamorig:" + n) || soldier.m.getObjectByName("mixamorig" + n);
  const pq = new THREE.Quaternion(), qq = new THREE.Quaternion();
  const turnWorld = (b, axis, ang) => { qq.setFromAxisAngle(axis, ang); b.getWorldQuaternion(pq); const nw = qq.multiply(pq);
    b.parent.getWorldQuaternion(pq); b.quaternion.copy(pq.invert().multiply(nw)); b.updateMatrixWorld(true); };
  const hold = side => { const hb = rig.B[(side === "R" ? "Right" : "Left") + "Hand"]; return { side, hb, p: hb.getWorldPosition(V()), q: hb.getWorldQuaternion(new THREE.Quaternion()) }; };
  const setHandQ = (hb, q) => { hb.parent.getWorldQuaternion(pq); hb.quaternion.copy(pq.invert().multiply(q)); hb.updateMatrixWorld(true); };
  // move the wrist to p (world) by arm IK and keep the hand's world orientation
  // the elbow keeps its current swing (pole), so an elbow lifted off the ground stays up
  const pin = (h, p = h.p) => { const P = h.side === "R" ? "Right" : "Left", sh = rig.B[P + "Arm"].getWorldPosition(V()), el = rig.B[P + "ForeArm"].getWorldPosition(V());
    const ax = h.hb.getWorldPosition(V()).sub(sh).normalize(), pole = el.sub(sh); pole.addScaledVector(ax, -pole.dot(ax));
    rig.arm(h.side, p, undefined, pole.lengthSq() > 1e-8 ? pole : undefined); setHandQ(h.hb, h.q); };
  // the glove follows the (collapsed) hand bone; the fingers keep what they have
  const follow = side => { const h = gloves.hands[side], s0 = h.bone.scale.x; h.bone.scale.setScalar(1); h.bone.updateMatrixWorld(true);
    h.g.matrix.copy(h.bone.matrixWorld); h.g.updateMatrixWorld(true); h.bone.scale.setScalar(s0); h.bone.updateMatrixWorld(true); };

  // lift a point of a limb by d with the smallest turn of the bone about its pivot
  function liftBy(bone, at, d, cap = 0.25) {
    const o = bone.getWorldPosition(V()), r = at.clone().sub(o), rh = Math.hypot(r.x, r.z); if (rh < 0.02) return false;
    const axis = r.clone().cross(V(0, 1, 0)).normalize(); turnWorld(bone, axis, Math.min(cap, d * 1.05 / rh)); return true;
  }

  // armsPinned: the hands are on something (rifle, Kestrel): body moves keep them where they are
  function solveBody(solids, armsPinned = true, report) {   // returns the deepest penetration left (m)
    if (!bodyS) return 0;
    const pins = armsPinned ? ["R", "L"].map(hold) : [];
    for (let it = 0; it < 4; it++) {
      soldier.m.updateMatrixWorld(true); col.skinUpdate(bodyS);
      let moved = false;
      for (const s of ["L", "R"]) {
        const P = s === "R" ? "Right" : "Left";
        const th = bodyS.byName["thigh" + s], ft = bodyS.byName["foot" + s];
        if (th) { const w = col.worst(bodyS, th.items, [], true, col.margin); if (w.depth > 0) moved = liftBy(B(P + "UpLeg"), w.at, w.depth) || moved; }
        if (ft) { col.skinUpdate(bodyS, ft.items); const w = col.worst(bodyS, ft.items, [], true, col.margin); if (w.depth > 0) moved = liftBy(B(P + "Leg"), w.at, w.depth) || moved; }
        const ar = bodyS.byName["arm" + s];
        if (ar && armsPinned) { col.skinUpdate(bodyS, ar.items); const w = col.worst(bodyS, ar.items, [], true, col.margin);
          if (w.depth > 0) {     // swing the elbow about the shoulder-wrist line: the wrist stays, the elbow comes up
            const sh = rig.B[P + "Arm"].getWorldPosition(V()), wr = rig.B[P + "Hand"].getWorldPosition(V()), ax = wr.clone().sub(sh).normalize();
            const h = pins.find(x => x.side === s), y0 = w.at.y;
            const arm = rig.B[P + "Arm"], q0 = arm.quaternion.clone(), r = w.at.clone().sub(sh); r.addScaledVector(ax, -r.dot(ax));
            const ang = Math.min(0.4, w.depth * 1.1 / Math.max(0.03, r.length()));
            turnWorld(arm, ax, ang); const y1 = w.at.clone().sub(sh).applyAxisAngle(ax, ang).y + sh.y;
            if (y1 < y0) { arm.quaternion.copy(q0); arm.updateMatrixWorld(true); turnWorld(arm, ax, -ang); }
            if (h) setHandQ(h.hb, h.q); moved = true; } }
      }
      soldier.m.updateMatrixWorld(true); col.skinUpdate(bodyS);
      const all = bodyS.groups.filter(g => armsPinned || !/^arm/.test(g.name)).flatMap(g => g.items);
      const w = col.worst(bodyS, all, [], true, col.margin);
      if (w.depth <= 0) break;
      if (!moved || it >= 2) {                       // the rest: the whole body up, the hands back where they were
        soldier.m.position.y += w.depth; soldier.m.updateMatrixWorld(true); for (const h of pins) pin(h); }
    }
    // whatever is still in the ground: the whole body up by that much (hands back on their holds)
    { soldier.m.updateMatrixWorld(true); col.skinUpdate(bodyS);
      const all = bodyS.groups.filter(g => armsPinned || !/^arm/.test(g.name)).flatMap(g => g.items), w = col.worst(bodyS, all, [], true, col.margin);
      if (w.depth > 0) { soldier.m.position.y += w.depth; soldier.m.updateMatrixWorld(true); for (const h of pins) pin(h); } }
    if (pins.length) { follow("R"); follow("L"); }
    soldier.m.updateMatrixWorld(true); col.skinUpdate(bodyS); const left = col.worst(bodyS, bodyS.groups.flatMap(g => g.items), [], true, 0);
    if (report) report.body = left;
    return left.depth;
  }

  const FING = ["index", "middle", "ring", "pinky", "thumb"];
  // returns the deepest penetration left (m), 0 when the hands are clear
  function solveHands(solids, report) {
    if (!glS) return 0; let residual = 0;
    for (const side of ["R", "L"]) {
      const H = gloves.hands[side], palm = glS.byName[side + ":palm"]; if (!palm) continue;
      const fingerItems = FING.map(f => glS.byName[side + ":" + f]).filter(Boolean).flatMap(g => g.items);
      const full = FING.map(f => H.fing[f].map(b => b.quaternion.clone()));   // the curl the animation asked for
      const fixed = new Map();        // fingers with no clear curl: kept at their least-deep curl and moved with the hand
      for (let round = 0; round < 6; round++) {
        FING.forEach((f, i) => H.fing[f].forEach((b, j) => fixed.has(f) ? b.quaternion.copy(H.restQ[f][j]).slerp(full[i][j], fixed.get(f)) : b.quaternion.copy(full[i][j]))); follow(side);
        const rigid = [...palm.items, ...[...fixed.keys()].flatMap(f => glS.byName[side + ":" + f] ? glS.byName[side + ":" + f].items : [])];
        // 1) the palm (and the fingers with no clear curl) out of the obstacles: push the wrist along the mean surface normal
        for (let it = 0; it < 12; it++) {
          follow(side); col.skinUpdate(glS, rigid); const w = col.worst(glS, rigid, solids, true);
          if (w.depth <= 0) break;
          const dir = w.sum.lengthSq() > 1e-12 ? w.sum.normalize() : w.n;   // mean normal: a hand between two surfaces does not bounce
          const h = hold(side); pin(h, h.p.clone().addScaledVector(dir, w.depth * (1.2 + 0.3 * Math.floor(it / 4)) + 0.0005));
        }
        follow(side);
        // 2) each other finger curls only until it touches: the most curl that is clear, from a few amounts, bisected
        let more = false;
        for (const f of FING) {
          if (fixed.has(f)) continue;
          const grp = glS.byName[side + ":" + f]; if (!grp) continue;
          const bones = H.fing[f], q1 = bones.map(b => b.quaternion.clone()), q0 = H.restQ[f];
          const probe = (first = true) => { H.g.updateMatrixWorld(true); col.skinUpdate(glS, grp.items); let w = col.worst(glS, grp.items, solids, true, col.margin, first);
            if (first && w.depth > 0) return w;
            for (const t of tipS) { const tg = t.byName[side + ":" + f]; if (tg) { col.skinUpdate(t, tg.items); const w2 = col.worst(t, tg.items, solids, true, col.margin, first); if (w2.depth > w.depth) w = w2; } }
            return w; };
          if (probe().depth <= 0) continue;
          const set = k => bones.forEach((b, i) => b.quaternion.copy(q0[i]).slerp(q1[i], k));
          let lo = -1;
          for (const k of [0.75, 0.5, 0.25, 0]) { set(k); if (probe().depth <= 0) { lo = k; break; } }
          if (lo < 0) for (const k of [1.25, 1.5, 1.75]) { set(k); if (probe().depth <= 0) { lo = k; break; } }   // or wrapped tighter round it
          if (lo > 1) { H.g.updateMatrixWorld(true); continue; }
          if (lo < 0) {                  // nothing clear: the least deep of the tried curls, and the hand moves for it
            let bk = 1, bd = Infinity; for (const k of [1, 0.75, 0.5, 0.25, 0, 1.25, 1.5, 1.75]) { set(k); const dd = probe(false).depth; if (dd < bd) { bd = dd; bk = k; } }
            set(bk); fixed.set(f, bk); more = true; continue; }
          let hi = Math.min(1, lo + 0.25);
          for (let s = 0; s < 3; s++) { const mid = (lo + hi) / 2; set(mid); if (probe().depth > 0) hi = mid; else lo = mid; }
          set(lo); H.g.updateMatrixWorld(true);
        }
        if (!more) break;
      }
      // 3) last resort (the hold itself is impossible, e.g. a hand wedged between the scope and the receiver): the whole
      // hand as it is, rigid, out along the mean normal with ever larger steps; then each finger eases off to contact
      { const all = [...palm.items, ...fingerItems]; col.skinUpdate(glS, all);
        if (col.worst(glS, all, solids, true, 0, true).depth > 0) {
          const curl = FING.map(f => H.fing[f].map(b => b.quaternion.clone()));   // the fingers keep their curl
          for (let it = 0; it < 30; it++) { follow(side); col.skinUpdate(glS, all); const w = col.worst(glS, all, solids, true);
            if (w.depth <= 0) break; const dir = w.sum.lengthSq() > 1e-12 ? w.sum.normalize() : w.n;
            const h = hold(side); pin(h, h.p.clone().addScaledVector(dir, w.depth * (1.5 + it * 0.25) + 0.001)); }
          follow(side);
          FING.forEach((f, i) => { const grp = glS.byName[side + ":" + f]; if (!grp) return; const bones = H.fing[f], q0 = H.restQ[f];
            const set = k => bones.forEach((b, j) => b.quaternion.copy(q0[j]).slerp(curl[i][j], k));
            const bad = () => { H.g.updateMatrixWorld(true); col.skinUpdate(glS, grp.items); return col.worst(glS, grp.items, solids, true, col.margin, true).depth > 0; };
            set(1); if (!bad()) return; let lo = 0, hi = 1; set(0); if (bad()) { set(1); return; }
            for (let s = 0; s < 5; s++) { const mid = (lo + hi) / 2; set(mid); if (bad()) hi = mid; else lo = mid; } set(lo); });
          H.g.updateMatrixWorld(true); } }
      col.skinUpdate(glS, [...palm.items, ...fingerItems]); const left = col.worst(glS, [...palm.items, ...fingerItems], solids, true, 0);
      residual = Math.max(residual, left.depth); if (report) report["hand" + side] = left;
    }
    return residual;
  }
  // residual violations without changing anything (the report, and the check with the collision switched off)
  function measure(solids) {
    const r = {}; soldier.m.updateMatrixWorld(true);
    if (bodyS) { col.skinUpdate(bodyS); r.body = col.worst(bodyS, bodyS.groups.flatMap(g => g.items), [], true, 0); }
    if (glS) { col.skinUpdate(glS); for (const side of ["R", "L"]) r["hand" + side] = col.worst(glS, glS.groups.filter(g => g.name[0] === side).flatMap(g => g.items), solids, true, 0); }
    return r;
  }
  return { solveBody, solveHands, measure, bodyS, glS };
}
