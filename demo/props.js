// Sordin Supreme Pro-X LED, Night Camo, leather headband (reference: product photos, Sordin HEAR2).
// D-shaped cups in grey-black camouflage with a SORDIN plate, thick black cushions, twin stainless wires per side
// with a pivot on top of each cup, a wide black leather headband, three buttons on the right cup, battery knob and
// AUX socket on the left cup, a short cable between the cups. Local frame: x = wearer's left, y = up, z = forward,
// origin between the ears; ear centres at x = +-earX.

function camoCanvas(n = 256) {
  const c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d");
  let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "#33363a"; g.fillRect(0, 0, n, n);                    // Night Camo: dark greys and black, little light grey
  for (const [col, cnt, sz] of [["#1d1f21", 14, 0.22], ["#4b4f53", 12, 0.18], ["#0f1011", 10, 0.12], ["#62666a", 6, 0.1]]) {
    g.fillStyle = col;
    for (let i = 0; i < cnt; i++) {
      const x = r() * n, y = r() * n, rad = sz * n * (0.6 + r() * 0.6); g.beginPath();
      for (let k = 0; k <= 12; k++) { const t = k / 12 * Math.PI * 2, rr = rad * (0.6 + 0.4 * r()); const px = x + Math.cos(t) * rr * 1.3, py = y + Math.sin(t) * rr * 0.8; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath(); g.fill();
    }
  }
  return c;
}
function labelCanvas() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 96; const g = c.getContext("2d");
  g.fillStyle = "#111"; g.fillRect(0, 0, 256, 96);
  g.fillStyle = "#d8d8d8"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("Supreme Pro-X", 128, 30);
  g.fillStyle = "#c9a34a"; g.fillRect(48, 44, 160, 38); g.fillStyle = "#111"; g.font = "bold 30px sans-serif"; g.fillText("SORDIN", 128, 74);
  return c;
}

export function makeSordin(THREE, { earX = 0.115, earY = 0.075, apexY = 0.25 } = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const camoTex = new THREE.CanvasTexture(camoCanvas()); camoTex.colorSpace = THREE.SRGBColorSpace;
  const shellM = new THREE.MeshStandardMaterial({ map: camoTex, roughness: 0.7, metalness: 0.0 });
  const blackM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.75 });
  const leatherM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45, metalness: 0.0 });
  const steelM = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.25, metalness: 0.9 });
  const labelTex = new THREE.CanvasTexture(labelCanvas()); labelTex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group(); g.name = "sordin_supreme_pro_x";

  // D-shaped cup outline (y up, z forward), 92 mm tall, 74 mm wide, flatter at the bottom-front
  const outline = new THREE.Shape();
  outline.moveTo(-0.034, -0.040); outline.quadraticCurveTo(0.0, -0.050, 0.032, -0.036);
  outline.quadraticCurveTo(0.040, 0.0, 0.030, 0.034); outline.quadraticCurveTo(0.0, 0.050, -0.030, 0.036); outline.quadraticCurveTo(-0.040, 0.0, -0.034, -0.040);
  for (const side of [1, -1]) {                              // +1 = left ear, -1 = right ear
    const cup = new THREE.Group(); cup.position.set(side * earX, earY, 0.0); g.add(cup);
    // shell: the outline extruded outwards with a rounded bevel (dome-like)
    const shellGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 5, curveSegments: 24 });
    shellGeo.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);       // extrusion along +x (left) or -x (right)
    const shell = new THREE.Mesh(shellGeo, shellM); shell.position.x = side * 0.012; cup.add(shell);
    // ear cushion: a thick black ring against the head
    const cushion = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.011, 10, 32), blackM);
    cushion.rotation.y = Math.PI / 2; cushion.scale.set(1, 1.18, 0.9); cushion.position.x = side * 0.004; cup.add(cushion);
    // label plate on the outside
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.0135), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.4 }));
    lab.position.set(side * 0.0475, 0.006, 0.002); lab.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; cup.add(lab);
    // pivot block on top of the cup and the twin stainless wires up to the headband
    const pivot = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.03), blackM); pivot.position.set(side * 0.026, 0.044, 0); cup.add(pivot);
    for (const dz of [-0.017, 0.017]) {
      const pts = [V(side * (earX + 0.026), earY + 0.046, dz), V(side * (earX + 0.03), earY + 0.09, dz * 0.85), V(side * (earX + 0.012), apexY - 0.07, dz * 0.6)];
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0019, 6, false), steelM));
    }
    if (side < 0) {                                             // right cup: three buttons on the lower front
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.01), blackM); b.position.set(side * 0.049, -0.022, -0.012 + i * 0.012); cup.add(b); }
    } else {                                                    // left cup: battery knob and AUX socket
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 16), blackM); knob.rotation.z = Math.PI / 2; knob.position.set(0.05, -0.02, 0.014); cup.add(knob);
      const aux = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 12), steelM); aux.rotation.z = Math.PI / 2; aux.position.set(0.049, -0.01, 0.026); cup.add(aux);
    }
  }
  // wide leather headband over the top: a 48 mm x 10 mm strip along an arch
  const arch = new THREE.CatmullRomCurve3([V(-(earX + 0.012), apexY - 0.075, 0), V(-(earX - 0.01), apexY - 0.025, 0), V(0, apexY, 0), V(earX - 0.01, apexY - 0.025, 0), V(earX + 0.012, apexY - 0.075, 0)]);
  const strip = new THREE.Shape(); strip.moveTo(-0.024, -0.005); strip.lineTo(0.024, -0.005); strip.lineTo(0.024, 0.005); strip.lineTo(-0.024, 0.005); strip.lineTo(-0.024, -0.005);
  const band = new THREE.Mesh(new THREE.ExtrudeGeometry(strip, { steps: 40, bevelEnabled: false, extrudePath: arch }), leatherM); g.add(band);
  // short black cable between the cups, along the band
  const cable = new THREE.CatmullRomCurve3([V(earX + 0.02, earY + 0.05, -0.02), V(earX + 0.02, apexY - 0.06, -0.026), V(0, apexY + 0.006, -0.026), V(-(earX + 0.02), apexY - 0.06, -0.026), V(-(earX + 0.02), earY + 0.05, -0.02)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 40, 0.0018, 6, false), blackM));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
