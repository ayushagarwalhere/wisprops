// The calm backdrop behind the console: a deep navy-to-indigo gradient, a few slow soft glows,
// a faint dot grid and fine film grain. Every frame is a pure function of time t.

const fract = (x) => x - Math.floor(x);
const rnd = (i, k = 0) => fract(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);

// [x, y, radius, rgb, alpha, drift x, drift y, speed]
const GLOWS = [
  [330, 250, 780, "63, 109, 255", 0.42, 90, 50, 0.05],
  [1660, 880, 860, "139, 92, 246", 0.36, 110, 60, 0.037],
  [1520, 120, 540, "34, 195, 166", 0.14, 70, 40, 0.061],
  [260, 980, 600, "255, 122, 182", 0.1, 80, 30, 0.043],
];

export function makeBackdrop(w, h) {
  const base = document.createElement("canvas"); base.width = w; base.height = h;
  const g = base.getContext("2d");
  const sky = g.createLinearGradient(0, 0, w * 0.3, h);
  sky.addColorStop(0, "#0a1029"); sky.addColorStop(0.6, "#0d0f2c"); sky.addColorStop(1, "#140e2e");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(170, 195, 255, .07)";
  for (let y = 18; y < h; y += 36) for (let x = 18; x < w; x += 36) { g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill(); }

  const grain = document.createElement("canvas"); grain.width = grain.height = 256;
  const gg = grain.getContext("2d"), img = gg.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = rnd(i, 3) * 255; img.data.set([v, v, v, 9], i * 4); }
  gg.putImageData(img, 0, 0);

  return function draw(ctx, t) {
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = "screen";
    for (const [x, y, r, c, a, dx, dy, s] of GLOWS) {
      const cx = x + Math.sin(t * s * 6.283) * dx, cy = y + Math.cos(t * s * 5.1) * dy;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${c}, ${a})`); grad.addColorStop(0.45, `rgba(${c}, ${a * 0.4})`); grad.addColorStop(1, `rgba(${c}, 0)`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
    const o = (Math.floor(t * 12) * 97) % 256;
    ctx.fillStyle = ctx.createPattern(grain, "repeat");
    ctx.save(); ctx.translate(-o, -((o * 7) % 256)); ctx.fillRect(0, 0, w + 256, h + 256); ctx.restore();
  };
}
