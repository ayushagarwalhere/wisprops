// Voices, timeline and the final audio mix for the WisprOps video.
// node video/build-audio.js [script.json] [outdir]  →  <outdir>/timeline.json + <outdir>/audio.wav (default: script2.json, build2/)
// Voices and sound effects are cached in build/tts and build/sfx, shared by both cuts.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FF = process.env.FFMPEG || "C:/Users/daksh/AppData/Roaming/Python/Python314/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe";
const PY = process.env.PYTHON || "python";
const DIR = __dirname, OUT = path.resolve(DIR, process.argv[3] || "build2"), TTS = path.join(DIR, "build", "tts"), SFX = path.join(DIR, "build", "sfx");
for (const d of [OUT, TTS, SFX]) fs.mkdirSync(d, { recursive: true });
const S = JSON.parse(fs.readFileSync(path.resolve(DIR, process.argv[2] || "script2.json"), "utf8"));
const FPS = S.fps;

function ff(args, opts = {}) { return execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 28, ...opts }); }

// Spoken text: say things the way a person would ("db pool", "three oh four"); the caption keeps the written form.
function tts(line) {
  const file = path.join(TTS, (S.ttsPrefix || "") + line.id + ".mp3");
  const v = S.voices[line.who];
  const spoken = line.say || line.text;
  const key = JSON.stringify([spoken, v]);
  const keyFile = file + ".key";
  if (!fs.existsSync(file) || !fs.existsSync(keyFile) || fs.readFileSync(keyFile, "utf8") !== key) {
    execFileSync(PY, ["-m", "edge_tts", "--voice", v.voice, "--rate=" + v.rate, "--text", spoken, "--write-media", file], { stdio: "pipe" });
    fs.writeFileSync(keyFile, key);
  }
  return file;
}

// Loudness per video frame, 0..1, for the mouths.
function envelope(file) {
  const pcm = ff(["-i", file, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]);
  const n = pcm.length / 2, per = 16000 / FPS, out = [];
  for (let f = 0; f * per < n; f++) {
    let s = 0, c = 0;
    for (let i = Math.floor(f * per); i < Math.min(n, Math.floor((f + 1) * per)); i++) { const x = pcm.readInt16LE(i * 2) / 32768; s += x * x; c++; }
    out.push(c ? Math.sqrt(s / c) : 0);
  }
  const peak = Math.max(...out, 1e-6);
  return { dur: n / 16000, env: out.map((x) => +Math.min(1, x / (peak * 0.7)).toFixed(3)) };
}

// Sound effects, synthesized so nothing is borrowed.
const SOUNDS = {
  buzz: ["aevalsrc=0.55*sin(2*PI*150*t)*sin(2*PI*300*t)*lt(mod(t\\,0.9)\\,0.45):s=48000:d=2.7"],
  keys: ["aevalsrc=(random(0)*2-1)*0.5*lt(mod(t+0.013*sin(9*t)\\,0.13)\\,0.014)*exp(-60*mod(t\\,0.13)):s=48000:d=1.25"],
  chime: ["aevalsrc=0.22*(sin(2*PI*880*t)+0.6*sin(2*PI*1318.5*t)*gt(t\\,0.09))*exp(-3.2*t):s=48000:d=1.6"],
  nope: ["aevalsrc=0.22*sin(2*PI*196*t)*exp(-5*t)+0.18*sin(2*PI*185*(t-0.16))*gt(t\\,0.16)*exp(-5*(t-0.16)):s=48000:d=0.9"],
  whoosh: ["anoisesrc=d=0.8:c=pink:r=48000:a=0.25", "-af", "bandpass=f=900:w=700,afade=t=in:d=0.35,afade=t=out:st=0.4:d=0.4"],
  pop: ["aevalsrc=0.3*sin(2*PI*(420+900*t)*t)*exp(-9*t):s=48000:d=0.5"],
};
for (const [name, a] of Object.entries(SOUNDS)) {
  const f = path.join(SFX, name + ".wav");
  ff(["-f", "lavfi", "-i", a[0], ...(a.slice(1)), "-ac", "2", f]);
}

// Timeline.
let cursor = 0;
const lines = [], sfx = [];
for (const line of S.lines) {
  const file = tts(line);
  const { dur, env } = envelope(file);
  let start = Math.max(cursor + (line.pre ?? 0.38), line.at ?? 0);
  if (line.typing) { sfx.push({ name: "keys", at: start }); start += 1.15; }
  if (line.sfx) { sfx.push({ name: line.sfx, at: start - 1.3 }); start += 1.2; }
  if (line.appear) sfx.push({ name: "pop", at: start - 0.5 });
  if (line.act && lines.length) sfx.push({ name: "whoosh", at: start - 0.7 });
  const end = start + dur;
  if (line.wispr) sfx.push({ name: "chime", at: end + 0.05 });
  if (line.nope) sfx.push({ name: "nope", at: end + 0.1 });
  for (const [name, off] of line.fx || []) sfx.push({ name, at: start + off });
  lines.push({ ...line, file, start: +start.toFixed(3), end: +end.toFixed(3), env });
  cursor = end + (line.post || 0) + (line.wispr ? 0.35 : 0);
}
const duration = +(cursor + 0.5).toFixed(3);
fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({ fps: FPS, width: S.width, height: S.height, duration, lines: lines.map(({ file, ...l }) => l), sfx }));
console.log("duration", duration.toFixed(1), "s,", lines.length, "lines");

// Mix: a quiet night pad under everything, then voices and effects at their times.
const pad = `aevalsrc=0.028*(sin(2*PI*110*t)+0.8*sin(2*PI*164.81*t)+0.6*sin(2*PI*220.5*t)+0.4*sin(2*PI*329.6*t*(1+0.003*sin(2*PI*0.07*t))))*(0.75+0.25*sin(2*PI*0.05*t)):s=48000:d=${duration}`;
const inputs = ["-f", "lavfi", "-i", pad];
const parts = ["[0:a]lowpass=f=900,afade=t=in:d=3,afade=t=out:st=" + (duration - 3) + ":d=3,aformat=channel_layouts=stereo[pad]"];
const labels = ["[pad]"];
let k = 1;
for (const l of lines) {
  inputs.push("-i", l.file);
  const ms = Math.round(l.start * 1000);
  parts.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.0,adelay=${ms}|${ms}[v${k}]`);
  labels.push(`[v${k}]`); k++;
}
for (const s of sfx) {
  inputs.push("-i", path.join(SFX, s.name + ".wav"));
  const ms = Math.max(0, Math.round(s.at * 1000));
  parts.push(`[${k}:a]volume=0.8,adelay=${ms}|${ms}[s${k}]`);
  labels.push(`[s${k}]`); k++;
}
parts.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=first,alimiter=limit=0.95[out]`);
const graph = path.join(OUT, "mix.txt");
fs.writeFileSync(graph, parts.join(";\n"));
ff([...inputs, "-filter_complex_script", graph, "-map", "[out]", "-ar", "48000", path.join(OUT, "audio.wav")]);
console.log("audio.wav written");
