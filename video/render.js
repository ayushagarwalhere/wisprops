// Render the video frames with headless Chromium, in parallel, then encode with the audio.
//   node video/render.js --cut 2         the two-minute cut → video/out/wisprops-video-2min.mp4 (the default)
//   node video/render.js --cut 3         the long cut (about 3:15) → video/out/wisprops-video-3min.mp4
//   node video/render.js --stills 3,60   a few frames → video/build2/stills/
//   node video/render.js --workers 8 --from 0 --to 30
// Frames already in <build>/frames are kept (so a stopped render resumes). Delete that folder after changing the scene.
const { chromium } = require(process.env.PLAYWRIGHT || "C:/Users/daksh/OneDrive/Desktop/no-hands/no-hands/node_modules/playwright");
const { execFileSync } = require("child_process");
const http = require("http"), fs = require("fs"), path = require("path");

const FF = process.env.FFMPEG || "C:/Users/daksh/AppData/Roaming/Python/Python314/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
// Both cuts use scene2.html: --cut 2 reads script2.json and build2/, --cut 3 reads script3.json and build3/.
const CUT = arg("cut", "2");
if (!["2", "3"].includes(CUT)) throw new Error("--cut must be 2 or 3");
const DIR = __dirname, BUILD = path.join(DIR, "build" + CUT), FRAMES = path.join(BUILD, "frames"), OUT = path.join(DIR, "out");
const PAGE = { 2: "scene2.html?b=build2", 3: "scene2.html?b=build3&s=script3.json" }[CUT];
const OUTFILE = { 2: "wisprops-video-2min.mp4", 3: "wisprops-video-3min.mp4" }[CUT];
const TL = JSON.parse(fs.readFileSync(path.join(BUILD, "timeline.json"), "utf8"));
const FPS = TL.fps, TOTAL = Math.ceil(TL.duration * FPS);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
function serve() {
  const root = path.resolve(DIR);
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const f = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => ok(s));
  });
}

async function page(browser, port) {
  const p = await browser.newPage({ viewport: { width: TL.width, height: TL.height }, deviceScaleFactor: 1 });
  p.on("pageerror", (e) => console.error("pageerror:", e.message));
  await p.goto(`http://127.0.0.1:${port}/${PAGE}`);
  await p.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  return p;
}
async function frame(p, t, file) {
  await p.evaluate((t) => window.renderAt(t), t);
  await p.screenshot({ path: file, type: "jpeg", quality: 93, timeout: 120000 });
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch({ args: process.env.SOFTWARE ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
  try {
    if (arg("stills")) {
      const dir = path.join(BUILD, "stills"); fs.mkdirSync(dir, { recursive: true });
      const p = await page(browser, port);
      for (const t of arg("stills").split(",").map(Number)) { await frame(p, t, path.join(dir, `t${String(t).replace(".", "_")}.jpg`)); }
      console.log("stills in", dir);
      return;
    }
    fs.mkdirSync(FRAMES, { recursive: true });
    const from = Math.floor(+arg("from", 0) * FPS), to = Math.min(TOTAL, Math.ceil(+arg("to", TL.duration) * FPS));
    const n = +arg("workers", 4);
    const todo = [];
    for (let f = from; f < to; f++) { const file = path.join(FRAMES, `f${String(f).padStart(5, "0")}.jpg`); if (!fs.existsSync(file)) todo.push(f); }
    console.log(`${todo.length} frames to render with ${n} workers`);
    let done = 0, t0 = Date.now();
    await Promise.all(Array.from({ length: n }, async (_, w) => {
      const p = await page(browser, port);
      for (let j = w; j < todo.length; j += n) {
        const f = todo[j];
        await frame(p, f / FPS, path.join(FRAMES, `f${String(f).padStart(5, "0")}.jpg`));
        if (++done % 150 === 0) { const r = done / ((Date.now() - t0) / 1000); console.log(`${done}/${todo.length} · ${r.toFixed(1)} fps · ~${Math.round((todo.length - done) / r)} s left`); }
      }
    }));
    if (arg("encode", "yes") === "yes" || arg("encode-only")) {
      fs.mkdirSync(OUT, { recursive: true });
      const out = path.join(OUT, OUTFILE);
      execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", path.join(FRAMES, "f%05d.jpg"), "-i", path.join(BUILD, "audio.wav"),
        "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], { stdio: "inherit" });
      console.log("wrote", out);
    }
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
