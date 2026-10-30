// The landscape cut (up to two minutes): the problem and the cause in 3D, the solution in the real console.
// window.renderAt(t) draws the frame at time t; it waits for the console frame image to decode.
import * as THREE from "three";
import { buildWorld } from "./world.js";
import { makeBackdrop } from "./backdrop.js";
import { loadDevModel, makeDev, loadMascotModel, makeMascot } from "./chars.js";

const Q = new URLSearchParams(location.search);
const BUILD = Q.get("b") || "build2";
const TL = await (await fetch(BUILD + "/timeline.json")).json();
const SCRIPT = await (await fetch(Q.get("s") || "script2.json")).json();
const FRAMES = await (await fetch(BUILD + "/frames.json")).json(); // clip → frame count
const REG = SCRIPT.regions;
const LINES = TL.lines;
const byId = Object.fromEntries(LINES.map((l) => [l.id, l]));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const pop = (x) => { x = clamp(x); const c = 2.70158; return 1 + c * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2); };
const $ = (id) => document.getElementById(id);

// ---------- 3D ----------
const renderer = new THREE.WebGLRenderer({ canvas: $("c"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const pipR = new THREE.WebGLRenderer({ canvas: $("pip"), antialias: true, alpha: true, preserveDrawingBuffer: true });
pipR.setPixelRatio(1); pipR.setSize(168, 168, false);
pipR.toneMapping = THREE.ACESFilmicToneMapping; pipR.toneMappingExposure = 1.3; pipR.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const SKY = new THREE.Color("#0b1233");
scene.background = SKY;
scene.fog = new THREE.Fog("#0b1233", 5, 14);
const camera = new THREE.PerspectiveCamera(32, 1920 / 1080, 0.03, 60);
const pipCam = new THREE.PerspectiveCamera(30, 1, 0.03, 30);
const W = buildWorld(scene);
// The developer: one rig at the desk, one in bed.
const DEV_GLTF = await loadDevModel("models/dev.glb");
const DEV_SCALE = 0.85;
const desk = makeDev(DEV_GLTF, DEV_SCALE); desk.rig.position.set(-0.5, 0.54, -0.82); scene.add(desk.rig);
const bed = makeDev(DEV_GLTF, DEV_SCALE); bed.rig.position.set(W.BX, 0.74, -1.0); scene.add(bed.rig);
// WisprOps: the Dokibird bird, standing on the books.
const mascot = makeMascot(await loadMascotModel("models/mascot.glb"), 0.6);
W.owlBody.add(mascot.root);
const { owl, owlBody, phone, phoneScreen, phoneLight, moon, lamp, BX, BOOK_TOP } = W;

// The calm backdrop behind the console.
const drawBackdrop = makeBackdrop(1920, 1080);
const bgx = $("bg").getContext("2d");
const OWL_HEAD = new THREE.Vector3(0.6, BOOK_TOP + 0.13, -0.18);

const SHOTS = {
  bed: { from: [BX + 1.65, 1.75, 0.75], to: [BX + 1.5, 1.68, 0.5], look: [BX + 0.25, 0.95, -1.5], fov: 42 },
  devDesk: { from: [0.32, 1.52, 1.45], to: [0.25, 1.48, 1.2], look: [-0.4, 1.12, -0.8], fov: 36 },
  owl: { from: [0.42, 1.45, 1.3], to: [0.44, 1.42, 1.05], look: [0.24, 1.22, -0.18], fov: 32 },
  end: { from: [0.3, 1.58, 2.25], to: [0.3, 1.55, 1.95], look: [-0.05, 1.36, -0.18], fov: 30 },
};
// which side the card sits on, opposite the character
const CARD_SIDE = { bed: "right", devDesk: "right", owl: "left", end: "left" };

// ---------- timeline ----------
const lead = (l) => (l.sfx ? 2.6 : 0.15);
const segStart = (i) => LINES[i].start - lead(LINES[i]);
const nextStart = (i) => (i + 1 < LINES.length ? segStart(i + 1) : TL.duration);
function lineAt(t) { let i = 0; while (i + 1 < LINES.length && segStart(i + 1) <= t) i++; return i; }
const kindOf = (l) => (l.app ? "app:" + l.app.clip : l.terminal ? "term:" + l.terminal : "3d:" + l.shot);
function runOf(i, f) { let a = i, b = i; while (a > 0 && f(LINES[a - 1]) === f(LINES[i])) a--; while (b + 1 < LINES.length && f(LINES[b + 1]) === f(LINES[i])) b++; return [a, b]; }
function env(l, t) { if (!l || t < l.start || t > l.end) return 0; return l.env[Math.floor((t - l.start) * TL.fps)] || 0; }
function blink(t, seed) { return (t * 0.29 + seed) % 1 < 0.03 ? 0.12 : 1; }
const sfxAt = (name) => (TL.sfx.find((s) => s.name === name) || {}).at;

// Clip time for an app line: each line in a run continues where the previous one left off, at its own speed.
const clipStart = {};
for (let i = 0; i < LINES.length; i++) {
  const l = LINES[i]; if (!l.app) continue;
  const p = LINES[i - 1];
  if (l.app.in != null || !p || !p.app || p.app.clip !== l.app.clip) clipStart[i] = l.app.in ?? 0;
  else clipStart[i] = clipStart[i - 1] + (segStart(i) - segStart(i - 1)) * (p.app.speed || 1);
}
function region(l, u) {
  const z = l.app.zoom || [[0, "FULL"]];
  let r = REG[z[0][1]];
  for (let k = 1; k < z.length; k++) {
    const R = REG[z[k][1]], m = smooth((u - z[k][0]) / 0.9);
    r = [lerp(r[0], R[0], m), lerp(r[1], R[1], m), lerp(r[2], R[2], m)];
  }
  return r;
}

// ---------- cards (3D shots only) ----------
const LOGO = `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#1d5bd8"/><path d="M8 16h2M12 11v10M16 8v16M20 11v10M24 14v4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const show = (u, at) => `style="opacity:${u >= at ? smooth((u - at) / 0.35) : 0}"`;
const CARDS = {
  page: () => `<div class="card red"><div class="k"><span class="no">●</span> ALERT · 3:12 AM</div><div class="t">checkout-api is down</div>
    <div class="s">502 on <span class="mono">/pay</span> · 3 health checks failed</div><div class="pills"><span class="pill red">customers can't pay</span></div></div>`,
  usual: (u) => `<div class="card amber"><div class="k">What breaks at night</div><div class="grid2">
    <div class="tile" ${show(u, 1.2)}>⚙ A config value<small>someone changed it</small></div>
    <div class="tile" ${show(u, 2.4)}>⬆ A deploy<small>the new release is bad</small></div>
    <div class="tile" ${show(u, 3.4)}>⏻ A process<small>it stopped answering</small></div>
    <div class="tile" ${show(u, 4.4)}><span class="am">You</span><small>half asleep, typing into prod</small></div></div></div>`,
  again: (u) => `<div class="card amber"><div class="k">Same fault, again and again</div>
    ${[["Tue", "03:12"], ["Thu", "02:47"], ["Mon", "03:31"]].map(([d, h], i) => `<div class="row" ${show(u, 0.4 + i * 0.9)}><span class="tm">${d}</span><span class="mono">${h}</span>&nbsp;checkout-api down <span class="no" style="margin-left:auto">woke you</span></div>`).join("")}
    <div class="s" style="margin-top:14px" ${show(u, 3.4)}>Who changed what? <span class="am">Nobody wrote it down.</span></div></div>`,
  night: (u) => `<div class="card amber"><div class="k">The usual night</div>
    ${[["03:12", "paged", "no"], ["03:25", "dashboards, logs, deploys", ""], ["03:48", "found it: one config value", "am"], ["04:05", "fixed by hand, half asleep", "no"]].map(([h, w, c], i) => `<div class="row" ${show(u, 0.5 + i * 1.6)}><span class="tm mono">${h}</span><span class="${c}">${w}</span></div>`).join("")}</div>`,
  yes: (u) => `<div class="card"><div class="k">Who said yes?</div>
    <div class="row" ${show(u, 0.4)}><span class="no">✖</span>&nbsp;a bot deciding on its own</div>
    <div class="row" ${show(u, 1.4)}><span class="no">✖</span>&nbsp;a click, a paste, a typed “yes”</div>
    <div class="row" ${show(u, 3.6)}><span class="ok">✔</span>&nbsp;your voice, through Wispr Flow</div></div>`,
  end: () => `<div style="text-align:left"><div style="width:120px;height:120px">${LOGO}</div><div class="big" style="margin:24px 0 12px">WisprOps</div>
    <div class="t" style="font-weight:600">Sleep. I'm on call.</div><div class="s" style="margin-top:30px">github.com/ayushagarwalhere/wisprops</div>
    <div class="s" style="margin-top:10px;color:var(--muted)">Built with Wispr Flow · No Hands: The Wispr Challenge</div>
    <div style="margin-top:34px;font-size:19px;color:var(--muted);line-height:1.4">Developer character: “Nerd Survivor” by HighPolyDensity, CC BY 4.0 (sketchfab.com), trimmed to fewer animations.<br>Mascot: the Dokibird bird 3D model, by its original creators.</div></div>`,
};

// ---------- terminal: real output of the real commands ----------
const JUDGE = ["golden snapshot taken: db_pool=20, release v41", "cause found and attributed: db_pool 20 → 0, changed by deploy-bot", "“yes, do it” changed nothing",
  "the exact phrase, typed on a keyboard, was refused", "the bare phrase is not enough: it asks you to say the fix back", "a say-back with the wrong value (10, not 20) was refused",
  "the right say-back applied it: db_pool ✓ 20 ✓ checkout-api ✓", "verified recovery: 3 healthy checks in a row and db_pool back to 20", "standing order so-1: one service, one signature, one action, 3 uses, 7 days",
  "fixed under the standing order; nobody was woken", "it remembered: the 2nd time in 7 days", "frozen: even a Wispr approval applies nothing", "unfreezing by keyboard is refused",
  "rolled back to v41 and verified", "approval record quotes the words, what you said back, and how they arrived", "the debrief became action items with owners, a cause, and a rule WisprOps now enforces"];
// Real output of a fresh install (the sign-in key is hidden, the folder is shortened to ~/shop).
function setupTerminal(u) {
  const typed = (s, a, b) => s.slice(0, Math.floor(clamp((u - a) / (b - a)) * s.length));
  let out = `<span class="p">~/shop $</span> ${typed("npm i -g github:ayushagarwalhere/wisprops", 0.2, 1.3)}`;
  if (u > 1.5) out += `
<span class="c">added 1 package in 4s</span>`;
  if (u > 1.8) out += `
<span class="p">~/shop $</span> ${typed("wisprops start", 1.9, 2.4)}`;
  if (u > 2.6) out += `
Created wisprops.config.json in ~/shop.`;
  if (u > 2.85) out += `
<span class="b">WisprOps is running, with nothing to watch yet.</span> Open the console and add your first service (you can describe it out loud).`;
  if (u > 3.15) out += `
Console: <span class="ok">http://localhost:7300/login?key=</span><span class="c">••••••••••••</span>
<span class="c">         (open this link once to sign this browser in; then answer pages there with Wispr Flow)</span>`;
  return out + `<span class="caret"></span>`;
}
// Real output of `wisprops doctor` on the demo service.
const OK = `<span class="ok">✓</span>`;
const DOCTOR = [`<span class="b">checkout-api</span>`, `  ${OK} health     GET http://127.0.0.1:7301/healthz → 200 in 63ms`, `  ${OK} config     runtime/config.json: 3 keys watched, writable`,
  `  ${OK} release    current release: v41`, `  ${OK} restart    node ctl.js restart`, `  ${OK} rollback   node ctl.js release {to}`,
  `  ${OK} covers     can fix: config drift, bad deploy, dead process`, ``, `<span class="b">WisprOps</span>`,
  `  <span class="am">!</span> paging     No paging channel: pages only appear in the open console. Set notify.ntfy for your phone.`];
function doctorTerminal(u) {
  const typed = (s, a, b) => s.slice(0, Math.floor(clamp((u - a) / (b - a)) * s.length));
  let out = `<span class="p">$</span> ${typed("wisprops doctor", 0.2, 0.9)}`;
  const n = Math.floor(clamp((u - 1.2) / 2.4) * DOCTOR.length);
  for (let k = 0; k < n; k++) out += "\n" + DOCTOR[k];
  if (u > 3.9) out += `\n\n<span class="ok b">Ready.</span> Start it with: wisprops start`;
  return out + `<span class="caret"></span>`;
}
// The judge run. judgeOnly (long cut) skips the install line, which the how-to part shows.
function terminal(u, judgeOnly) {
  const typed = (s, a, b) => s.slice(0, Math.floor(clamp((u - a) / (b - a)) * s.length));
  if (judgeOnly) u += 1.9;
  let out = judgeOnly ? "" : `<span class="p">$</span> ${typed("npm i -g github:ayushagarwalhere/wisprops", 0.2, 1.6)}\n`;
  if (u > 1.9) out += `<span class="p">$</span> ${typed("wisprops judge", 2.0, 2.6)}`;
  if (u > 2.8) out += `\n<span class="b">WisprOps · one incident, start to finish, in the terminal</span>`;
  const n = Math.floor(clamp((u - 3.0) / 2.6) * JUDGE.length);
  for (let k = 0; k < n; k++) out += `\n   <span class="ok">✓</span> ${JUDGE[k]}`;
  if (u > 5.8) out += `\n<span class="ok b">All 16 checks held.</span>`;
  if (u > 6.4 && !judgeOnly) out += `\n<span class="p">$</span> ${typed("wisprops start", 6.5, 7.1)}${u > 7.3 ? `\n<span class="c">watching your services · console on http://localhost:7300</span>` : ""}`;
  return out + `<span class="caret"></span>`;
}

// ---------- captions ----------
for (const l of LINES) {
  const parts = l.text.match(/[^.!?]+[.!?]+["”]?\s*|[^.!?]+$/g) || [l.text];
  const chunks = [];
  for (const p of parts) { if (chunks.length && (chunks[chunks.length - 1] + p).length <= 92) chunks[chunks.length - 1] += p; else chunks.push(p); }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  let at = l.start;
  l.chunks = chunks.map((c) => { const d = ((l.end - l.start) * c.length) / total; const o = { text: c.trim(), from: at, to: at + d }; at += d; return o; });
}
const ACTS = { problem: ["01", "The problem"], cause: ["02", "The cause"], solution: ["03", "The fix: WisprOps"], howto: ["04", "How to use it"], close: ["", ""] };

// ---------- characters, per frame ----------
// Which animation the developer plays on each line: [clip, loops?]
const DEV_CLIP = { p2: ["Crafting", true], c1: ["What?", false], e1: ["HI!", false] };
function devClip(i) {
  const l = LINES[i];
  if (DEV_CLIP[l.id]) return DEV_CLIP[l.id];
  return ["Loop Idle Default", true];
}
function clipTime(i, t) { const [, loop] = devClip(i), u = t - segStart(i) + (devClip(i)[0] === "What?" ? 0.2 : 0); return loop ? u + i * 1.7 : Math.min(u, 2.4); }
function animate(t, L, prev, speaking) {
  const i = LINES.indexOf(L);
  const devTalking = L.who === "dev" && speaking, e1 = devTalking ? env(L, t) : 0;
  // crossfade from the previous line's animation over 0.45 s
  const k = i > 0 && devClip(i - 1)[0] !== devClip(i)[0] ? smooth((t - segStart(i)) / 0.45) : 1;
  // "Crafting" hunches right over the desk; mix it with the idle so it reads as typing
  const mixIn = (n, tt, w) => n === "Crafting" ? [["Crafting", tt, w * 0.45], ["Loop Idle Default", tt, w * 0.55]] : [[n, tt, w]];
  const layers = mixIn(devClip(i)[0], clipTime(i, t), k);
  if (k < 1) layers.push(...mixIn(devClip(i - 1)[0], clipTime(i - 1, t), 1 - k));
  const owlLine = L.who === "owl" && L.shot;
  const yaw = (owlLine || L.shot === "end" ? 0.5 : 0) * smooth((t - L.start + 0.5) / 0.5);
  desk.pose({ layers, sit: "chair", yaw: yaw + Math.sin(t * 0.8) * 0.03, pitch: L.id === "p2" ? 0.18 : 0.02 + Math.sin(t * 1.3) * 0.02, talk: L.shot === "bed" ? 0 : e1, worried: L.act === "problem" || L.id === "p2" ? 1 : L.id === "c1" ? 0.5 : 0 });

  const appear = byId.c1.start - 0.55;
  owl.scale.setScalar(t < appear ? 0.0001 : pop((t - appear) / 0.55));
  const owlTalking = L.who === "owl" && speaking, e2 = owlTalking ? env(L, t) : 0;
  // cute: a gentle sway, a head tilt toward you while you talk, and a little hop when it starts a line
  const listening = L.who === "dev" && speaking;
  const tilt = listening ? 0.2 : owlTalking ? 0.07 * Math.sin(t * 3.2) : 0.09 * Math.sin(t * 0.8);
  mascot.pose({ talk: e2, flap: owlTalking ? 0.12 + 0.35 * Math.max(0, Math.sin(t * 5)) * e2 : 0.05 * Math.sin(t * 2), blink: blink(t, 0.61) > 0.5 ? 1 : 0.12, tilt });
  const h = (t - L.start + 0.25) / 0.38, hop = L.who === "owl" && h > 0 && h < 1 ? Math.sin(Math.PI * h) : 0;
  owlBody.position.y = Math.abs(Math.sin(t * 2.1)) * 0.005 + e2 * 0.007 + hop * 0.035;
  owlBody.scale.set(1 - e2 * 0.02, 1 + e2 * 0.035, 1);
  owlBody.rotation.y = (L.who === "dev" && L.shot ? -0.42 * smooth((t - L.start + 0.35) / 0.4) : 0) + Math.sin(t * 0.9) * 0.04;
  owlBody.rotation.z = Math.sin(t * 1.1) * 0.03 + e2 * 0.05 * Math.sin(t * 7);

  const buzz = sfxAt("buzz") ?? -9;
  const ringing = t >= buzz && t < segStart(1);
  const pulse = ringing && ((t - buzz) % 0.9) < 0.45;
  phoneScreen.material.color.set(ringing ? "#cfe0ff" : "#000000");
  phone.position.x = BX + 0.95 + (pulse ? Math.sin(t * 90) * 0.004 : 0);
  phoneLight.intensity = ringing ? 1.6 : 0;
  moon.intensity = L.shot === "bed" ? 1.1 : 0;
  // in bed: asleep, then the phone buzzes and he sits up
  const up = smooth((t - buzz - 0.9) / 1.3);
  if (L.shot === "bed") {
    bed.rig.rotation.x = -lerp(1.5, 0.42, up);
    bed.pose({ layers: [["Loop Idle Wounded 1", t, 1]], sit: "bed", yaw: 0.55 * up, pitch: 0.12 * up, talk: L.who === "dev" ? env(L, t) : 0, worried: up });
  }
  lamp.intensity = L.shot === "end" ? 1.4 : 2.4;
}

// ---------- one frame ----------
let lastCard = "", lastCap = "", lastSrc = "", lastAct = "";
window.renderAt = async function renderAt(t) {
  const i = lineAt(t), L = LINES[i], prev = LINES[i - 1];
  const speaking = t >= L.start && t <= L.end;
  animate(t, L, prev, speaking);
  const isApp = !!(L.app || L.terminal);

  // 3D shot, or the framed console
  $("c").style.display = isApp ? "none" : "block";
  $("bg").style.display = isApp ? "block" : "none";
  if (isApp) drawBackdrop(bgx, t);
  $("win").style.display = isApp ? "block" : "none";
  $("pipwrap").style.display = isApp ? "block" : "none";
  if (!isApp) {
    const [a, b] = runOf(i, kindOf);
    const k = smooth((t - segStart(a)) / Math.max(1, nextStart(b) - segStart(a)));
    const S = SHOTS[L.shot];
    camera.fov = S.fov; camera.updateProjectionMatrix();
    camera.position.set(lerp(S.from[0], S.to[0], k) + Math.sin(t * 0.7) * 0.006, lerp(S.from[1], S.to[1], k) + Math.sin(t * 0.9) * 0.004, lerp(S.from[2], S.to[2], k));
    camera.lookAt(...S.look);
    renderer.render(scene, camera);
  } else {
    const u = t - segStart(i);
    if (L.app) {
      $("term").style.display = "none"; $("shot").style.display = "block";
      const ct = clipStart[i] + u * (L.app.speed || 1);
      const n = FRAMES[L.app.clip];
      const f = Math.min(n, Math.max(1, Math.round(ct * 30) + 1));
      const src = `build/app/frames/${L.app.clip}/f${String(f).padStart(5, "0")}.jpg`;
      if (src !== lastSrc) { $("shot").src = src; lastSrc = src; try { await $("shot").decode(); } catch { /* keep the last frame */ } }
      const [a] = runOf(i, kindOf);
      const r = region(L, u);
      const drift = 1 + 0.018 * smooth((t - segStart(a)) / 12);
      const sc = (1472 / r[2]) * drift;
      const cx = r[0] + r[2] / 2, cy = r[1] + (r[2] * 9) / 32;
      $("shot").style.transform = `translate(${736 - cx * sc}px, ${414 - cy * sc}px) scale(${sc})`;
    } else {
      $("shot").style.display = "none"; $("term").style.display = "block";
      $("term").innerHTML = L.terminal === "setup" ? setupTerminal(u) : L.terminal === "doctor" ? doctorTerminal(u) : terminal(u, L.terminal === "judge");
    }
    // the speaker, small
    const who = L.who;
    $("pipwrap").className = who === "dev" ? "dev" : "";
    $("pipname").textContent = who === "dev" ? "You · Wispr Flow" : "WisprOps";
    const target = who === "dev" ? desk.headWorld().add(new THREE.Vector3(0, -0.03, 0)) : OWL_HEAD.clone().add(new THREE.Vector3(0, -0.02, 0));
    pipCam.position.copy(target).add(new THREE.Vector3(who === "dev" ? 0.06 : 0.01, who === "dev" ? 0.05 : 0.03, who === "dev" ? 1.3 : 0.62));
    pipCam.lookAt(target);
    scene.background = null; scene.fog = null;
    pipR.render(scene, pipCam);
    scene.background = SKY; scene.fog = new THREE.Fog("#0b1233", 5, 14);
    $("pip").style.transform = `scale(${1 + (speaking ? env(L, t) * 0.03 : 0)})`;
  }

  // act label: on the window bar for console shots, top-left otherwise
  const actLine = [...LINES.slice(0, i + 1)].reverse().find((l) => l.act);
  const act = actLine ? actLine.act : "problem";
  const label = ACTS[act];
  if (isApp) { $("act").innerHTML = ""; $("wintitle").innerHTML = `<b>${label[0]}</b> · ${label[1]}`; }
  else {
    const html = L.shot === "end" ? "" : `<span class="n">${label[0]}</span><span class="bar"></span><span>${label[1]}</span>`;
    if (html !== lastAct) { $("act").innerHTML = html; lastAct = html; }
    const k = actLine ? smooth((t - segStart(LINES.indexOf(actLine)) + 0.2) / 0.6) : 1;
    $("act").style.opacity = k; $("act").style.transform = `translateX(${(1 - k) * -30}px)`;
  }
  $("brand").innerHTML = !isApp && t > byId.s1.start - 0.3 && L.shot !== "end" ? `${LOGO}<span>WisprOps</span>` : "";

  // caption
  let cap = "";
  const capLine = speaking ? L : prev && t < prev.end + 0.3 && t < L.start ? prev : null;
  if (capLine && capLine.shot !== "end") {
    const ch = capLine.chunks.find((c) => t < c.to + 0.001) || capLine.chunks[capLine.chunks.length - 1];
    cap = `<span class="who ${capLine.who}">${capLine.who === "owl" ? "WisprOps" : "You"}</span>${ch.text}`;
  }
  if (cap !== lastCap) { $("cap").innerHTML = cap; lastCap = cap; }

  // card (3D shots)
  let html = "", op = 0, y = 0;
  if (L.card && !isApp) {
    const [ca, cb] = runOf(i, (l) => l.card);
    const c0 = segStart(ca), c1 = cb + 1 < LINES.length ? nextStart(cb) : TL.duration + 5;
    const u = t - c0;
    op = smooth(u / 0.35) * (1 - smooth((t - (c1 - 0.28)) / 0.28));
    y = (1 - ease(u / 0.45)) * 50;
    html = CARDS[L.card](u, t);
  }
  if (html !== lastCard) { $("card").innerHTML = html; lastCard = html; }
  const side = CARD_SIDE[L.shot] || "right";
  $("card").style.left = side === "left" ? "110px" : "auto";
  $("card").style.right = side === "right" ? "110px" : "auto";
  $("card").style.top = L.shot === "end" ? "230px" : "250px";
  $("card").style.opacity = op;
  $("card").style.transform = `translateY(${y}px)`;

  const fin = 1 - smooth(t / 0.9), fout = smooth((t - (TL.duration - 0.7)) / 0.7);
  $("fade").style.opacity = Math.max(fin, fout);
  $("veil").style.background = L.shot === "end"
    ? `linear-gradient(90deg, rgba(3,6,18,.88) 0%, rgba(3,6,18,.7) 45%, rgba(3,6,18,.1) 75%)`
    : isApp ? "none" : "radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(3, 6, 18, .6) 100%)";
  return true;
};
window.DURATION = TL.duration;
window.FPS = TL.fps;
window.__dbg = { THREE, scene, renderer, camera, desk, bed, LINES };
window.READY = true;
