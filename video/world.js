// The 3D world: the desk room and the bedroom. The characters come from chars.js.
import * as THREE from "three";

export function buildWorld(scene) {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.82, metalness: 0, ...o });
  const B = (c) => new THREE.MeshBasicMaterial({ color: c });
  function add(geo, mat, pos = [0, 0, 0], parent = scene, rot) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  scene.add(new THREE.HemisphereLight("#6f88d8", "#1a1433", 1.6));
  const rim = new THREE.DirectionalLight("#8fb0ff", 1.3); rim.position.set(2, 3, -2); scene.add(rim);
  const fill = new THREE.DirectionalLight("#ffd6b0", 0.5); fill.position.set(-1, 2, 3); scene.add(fill);

  // A night city through a window, painted once.
  function cityTexture(w, h, moonX, seed) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#0a1440"); sky.addColorStop(1, "#22307a");
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    let r = seed; const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; g.fillRect(rnd() * w, rnd() * h * 0.5, 2, 2); }
    g.fillStyle = "#ffe7b3"; g.beginPath(); g.arc(w * moonX, h * 0.2, h * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,231,179,.15)"; g.beginPath(); g.arc(w * moonX, h * 0.2, h * 0.13, 0, Math.PI * 2); g.fill();
    let x = 0;
    while (x < w) {
      const bw = 40 + rnd() * 70, bh = h * (0.25 + rnd() * 0.45);
      g.fillStyle = "#0b112e"; g.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 12; yy < h - 10; yy += 18) for (let xx = x + 8; xx < x + bw - 10; xx += 16) {
        if (rnd() < 0.32) { g.fillStyle = rnd() < 0.8 ? "#ffcf73" : "#9cc3ff"; g.fillRect(xx, yy, 7, 9); }
      }
      x += bw + 4;
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function windowAt(x, y, z, w, h, tex, parent = scene) {
    add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false }), [x, y, z + 0.005], parent);
    const fm = M("#2c3772");
    add(box(w + 0.12, 0.06, 0.08), fm, [x, y + h / 2, z + 0.02], parent);
    add(box(w + 0.12, 0.06, 0.08), fm, [x, y - h / 2, z + 0.02], parent);
    add(box(0.06, h, 0.08), fm, [x - w / 2, y, z + 0.02], parent);
    add(box(0.06, h, 0.08), fm, [x + w / 2, y, z + 0.02], parent);
    add(box(0.04, h, 0.05), fm, [x, y, z + 0.02], parent);
    add(box(w + 0.25, 0.05, 0.18), M("#3a4688"), [x, y - h / 2 - 0.03, z + 0.07], parent);
  }

  // ---------- the desk room ----------
  add(new THREE.PlaneGeometry(14, 14), M("#1b2250"), [0, 0, 0], scene, [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(14, 6), M("#1f2a62"), [0, 3, -3]);
  add(new THREE.PlaneGeometry(14, 6), M("#19214f"), [-3.2, 3, 0], scene, [0, Math.PI / 2, 0]);
  windowAt(-1.55, 1.85, -2.98, 1.5, 1.35, cityTexture(600, 540, 0.7, 7));

  // The wall display, where the cards appear in "screen" shots.
  function displayTexture() {
    const c = document.createElement("canvas"); c.width = 900; c.height = 560;
    const g = c.getContext("2d");
    g.fillStyle = "#0a1230"; g.fillRect(0, 0, 900, 560);
    g.strokeStyle = "rgba(110,168,255,.10)"; g.lineWidth = 1;
    for (let x = 0; x < 900; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 560); g.stroke(); }
    for (let y = 0; y < 560; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(900, y); g.stroke(); }
    g.textAlign = "center"; g.fillStyle = "rgba(160,196,255,.75)"; g.font = "600 30px Segoe UI"; g.fillText("checkout-api", 450, 120);
    g.fillStyle = "rgba(160,196,255,.45)"; g.font = "22px Segoe UI"; g.fillText("health · last hour", 450, 152);
    g.strokeStyle = "rgba(94,240,180,.75)"; g.lineWidth = 4; g.beginPath();
    for (let x = 0; x <= 520; x += 8) { const X = 190 + x, dip = x > 300 && x < 380; g.lineTo(X, 300 - 22 * Math.sin(x / 26) + (dip ? 110 : 0)); }
    g.stroke();
    g.fillStyle = "rgba(255,107,122,.8)"; g.beginPath(); g.arc(530, 410, 9, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  add(new THREE.PlaneGeometry(1.75, 1.1), new THREE.MeshBasicMaterial({ map: displayTexture(), fog: false }), [0.55, 1.95, -2.955]);
  add(box(1.85, 1.2, 0.05), M("#0d1330"), [0.55, 1.95, -2.99]);
  add(new THREE.PlaneGeometry(0.16, 0.16), M("#ff9fd1"), [1.38, 2.42, -2.94], scene, [0, 0, 0.12]);
  add(new THREE.PlaneGeometry(0.16, 0.16), M("#ffe17a"), [1.42, 2.22, -2.94], scene, [0, 0, -0.08]);

  // Desk, laptop, lamp, mug, books.
  const wood = M("#c9974f");
  add(box(2.7, 0.07, 1.05), wood, [0, 0.755, -0.12]);
  for (const [x, z] of [[-1.28, -0.58], [1.28, -0.58], [-1.28, 0.36], [1.28, 0.36]]) add(box(0.06, 0.75, 0.06), M("#8a6436"), [x, 0.375, z]);
  const LZ = -0.4;
  add(box(0.42, 0.018, 0.3), M("#8f99b8"), [-0.5, 0.799, LZ]);
  const lid = new THREE.Group(); lid.position.set(-0.5, 0.808, LZ + 0.15); lid.rotation.x = -0.32; scene.add(lid);
  add(box(0.42, 0.29, 0.012), M("#9aa4c4"), [0, 0.145, 0], lid);
  add(new THREE.CircleGeometry(0.03, 12), B("#cfe0ff"), [0, 0.15, 0.007], lid);
  const glow = new THREE.PointLight("#6d95ff", 1.6, 1.6, 1); glow.position.set(-0.5, 1.0, LZ - 0.05); scene.add(glow);
  add(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 8), M("#2b2f45"), [-1.12, 0.805, -0.35]);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), M("#2b2f45"), [-1.12, 1.02, -0.35], scene, [0, 0, 0.25]);
  add(new THREE.ConeGeometry(0.11, 0.14, 8, 1, true), M("#2b2f45", { side: THREE.DoubleSide }), [-1.02, 1.22, -0.3], scene, [0, 0, -0.9]);
  add(new THREE.SphereGeometry(0.035, 8, 6), B("#ffd59a"), [-0.99, 1.19, -0.3]);
  const lamp = new THREE.PointLight("#ffb066", 2.4, 3.2, 1); lamp.position.set(-0.95, 1.15, -0.2); scene.add(lamp);
  add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8), M("#e8eefc"), [0.05, 0.84, 0.18]);
  const books = [["#2b3a7a", 0.52, 0.1], ["#8e2f3f", 0.47, 0.11], ["#d9a441", 0.5, 0.1]];
  let by = 0.79;
  for (const [c, w, h] of books) { add(box(w, h, 0.36), M(c), [0.6, by + h / 2, -0.18], scene, [0, (w - 0.5) * 2, 0]); by += h; }
  const BOOK_TOP = by;
  // The chair.
  add(box(0.62, 0.06, 0.55), M("#232a4f"), [-0.5, 0.42, -0.86]); add(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), M("#1a1f3a"), [-0.5, 0.2, -0.86]); add(box(0.62, 0.6, 0.07), M("#232a4f"), [-0.5, 0.78, -1.15]);

  // Where WisprOps (the mascot) stands, on the books. owlBody is the part that bobs and leans.
  const owl = new THREE.Group(); owl.position.set(0.6, BOOK_TOP, -0.18); scene.add(owl);
  const owlBody = new THREE.Group(); owl.add(owlBody);

  // ---------- the bedroom (far away in the same world) ----------
  const BX = 20;
  add(new THREE.PlaneGeometry(8, 8), M("#151b40"), [BX, 0.001, 0], scene, [-Math.PI / 2, 0, 0]);
  add(new THREE.PlaneGeometry(8, 6), M("#1a2152"), [BX, 3, -3]);
  windowAt(BX - 0.2, 1.7, -2.98, 1.4, 1.2, cityTexture(600, 520, 0.3, 21));
  add(box(1.3, 0.36, 2.2), M("#3a2a4f"), [BX, 0.18, -1.2]);
  add(box(1.24, 0.16, 2.1), M("#e6e9f5"), [BX, 0.44, -1.2]);
  add(box(1.32, 0.9, 0.08), M("#3a2a4f"), [BX, 0.62, -2.3]);
  add(box(0.62, 0.12, 0.36), M("#f4f6ff"), [BX - 0.05, 0.58, -2.0], scene, [0.12, 0, 0]);
  add(new THREE.IcosahedronGeometry(0.5, 3), M("#2d4f9e", { flatShading: false }), [BX, 0.6, -0.72]).scale.set(1.3, 0.62, 1.55); // blanket
  add(box(0.5, 0.5, 0.42), M("#5a3d2b"), [BX + 0.98, 0.25, -1.95]);
  const phone = new THREE.Group(); phone.position.set(BX + 0.95, 0.508, -1.88); phone.rotation.y = 0.4; scene.add(phone);
  add(box(0.1, 0.014, 0.19), M("#15161f"), [0, 0, 0], phone);
  const phoneScreen = add(new THREE.PlaneGeometry(0.088, 0.17), new THREE.MeshBasicMaterial({ color: "#000000" }), [0, 0.0075, 0], phone, [-Math.PI / 2, 0, 0]);
  const phoneLight = new THREE.PointLight("#9cc3ff", 0, 1.8, 1); phoneLight.position.set(BX + 0.8, 0.8, -1.85); scene.add(phoneLight);
  const moon = new THREE.DirectionalLight("#8fb0ff", 0); moon.position.set(BX - 1, 3, -1); moon.target.position.set(BX, 0.5, -1.5); scene.add(moon, moon.target);

  return { owl, owlBody, phone, phoneScreen, phoneLight, moon, lamp, BX, BOOK_TOP };
}
