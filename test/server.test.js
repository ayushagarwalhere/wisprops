/* In-process server: remote access with a token, alert intake, export, doctor, security headers. Ports 7330/7331. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { start } = require("../server/server.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(100); } throw new Error("timed out"); }
// fetch() cannot set Host, so use http.request for the remote-host cases.
function req(method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: 7330, method, path: p, headers: headers || {} }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

test("server: tokens, hosts, origins, alerts, export, doctor", { timeout: 60000 }, async (t) => {
  let healthy = true;
  const svc = http.createServer((q, s) => { s.writeHead(healthy ? 200 : 503); s.end(healthy ? "ok" : "down"); }).listen(7331, "127.0.0.1");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-srv-"));
  fs.writeFileSync(path.join(dir, "app.env"), "DB_POOL=20\n");
  const TOKEN = "t".repeat(20) + "remote", ALERT = "a".repeat(24);
  fs.writeFileSync(path.join(dir, "wisprops.config.json"), JSON.stringify({
    port: 7330, settings: { intervalMs: 200, failAfter: 2, goldenAfter: 2, verifyOk: 2, sayItBack: false },
    access: { token: TOKEN, hosts: ["ops.example.com"] }, alerts: { token: ALERT },
    services: [{ id: "api", health: "http://127.0.0.1:7331/healthz", config: { file: "app.env" } }],
  }));
  const app = start({ config: path.join(dir, "wisprops.config.json"), quiet: true });
  t.after(() => { app.stop(); svc.close(); });
  await sleep(300);

  // localhost needs no token; remote host does; unknown host is refused
  assert.strictEqual((await req("GET", "/api/state", { Host: "localhost:7330" })).status, 200);
  assert.strictEqual((await req("GET", "/api/state", { Host: "ops.example.com" })).status, 401);
  assert.strictEqual((await req("GET", "/api/state", { Host: "evil.example" })).status, 403);
  assert.strictEqual((await req("GET", "/login?token=wrong", { Host: "ops.example.com" })).status, 401);
  const login = await req("GET", "/login?token=" + TOKEN, { Host: "ops.example.com", "X-Forwarded-Proto": "https" });
  assert.strictEqual(login.status, 302);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  assert.match(String(login.headers["set-cookie"]), /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.ok(!String(login.headers["set-cookie"]).includes(TOKEN), "the cookie is not the token itself");
  assert.strictEqual((await req("GET", "/api/state", { Host: "ops.example.com", Cookie: cookie })).status, 200);
  assert.strictEqual((await req("GET", "/api/state", { Host: "ops.example.com", Authorization: "Bearer " + TOKEN })).status, 200);

  // writes: same-origin JSON only, also through the tunnel
  const cmd = JSON.stringify({ text: "status", meta: { via: "typed", keys: 6 } });
  assert.strictEqual((await req("POST", "/api/command", { Host: "ops.example.com", Cookie: cookie, Origin: "https://evil.example", "Content-Type": "application/json" }, cmd)).status, 403);
  assert.strictEqual((await req("POST", "/api/command", { Host: "ops.example.com", Cookie: cookie, Origin: "https://ops.example.com", "Content-Type": "application/json" }, cmd)).status, 200);
  assert.strictEqual((await req("POST", "/api/command", { Host: "localhost:7330", "Content-Type": "text/plain" }, cmd)).status, 403);

  // a scripted "sim" approval is never trusted by the live server
  await until(async () => (await (await fetch("http://127.0.0.1:7330/api/state")).json()).state.svc.api.golden, 5000);
  fs.writeFileSync(path.join(dir, "app.env"), "DB_POOL=0\n");
  healthy = false;
  const inc = await until(async () => (await (await fetch("http://127.0.0.1:7330/api/state")).json()).state.incidents.find((i) => i.status === "proposed"), 5000);
  assert.strictEqual(inc.cause.kind, "config_drift");
  const post = (body, headers) => fetch("http://127.0.0.1:7330/api/command", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body) });
  // no session: a local script cannot approve, whatever burst it claims
  assert.strictEqual((await post({ id: inc.id, text: "approve fix one", meta: { via: "wispr", insert: 15, keys: 0 } })).status, 401);
  // a proxied request is never "local", even with Host: localhost
  assert.strictEqual((await req("GET", "/api/state", { Host: "localhost:7330", "X-Forwarded-For": "203.0.113.9" })).status, 401);
  // the demo's "sim" label and MCP never count as a Wispr burst
  const auth = { Authorization: "Bearer " + app.secret };
  let r = await (await post({ id: inc.id, text: "approve fix one", meta: { via: "sim", insert: 15, keys: 0 } }, auth)).json();
  assert.match(r.reply, /Refused/);
  r = await (await post({ id: inc.id, text: "approve fix one", meta: { via: "mcp", insert: 15, keys: 0 } }, auth)).json();
  assert.match(r.reply, /Refused/);
  r = await (await post({ id: "inc-999", text: "approve fix one", meta: { via: "wispr", insert: 15, keys: 0 } }, auth)).json();
  assert.match(r.reply, /No incident with that id/);
  // the console key signs in locally only
  assert.strictEqual((await req("GET", "/login?key=" + app.secret, { Host: "localhost:7330" })).status, 302);
  assert.strictEqual((await req("GET", "/login?key=" + app.secret, { Host: "ops.example.com" })).status, 401);
  // a malformed alert does not crash the server
  assert.strictEqual((await req("POST", "/api/alert", { Host: "localhost:7330", "Content-Type": "application/json", Authorization: "Bearer " + ALERT }, JSON.stringify({ alerts: [null, 5] }))).status, 202);

  // alerts: token required; Alertmanager body joins the open incident
  const am = JSON.stringify({ status: "firing", alerts: [{ status: "firing", labels: { alertname: "HighErrorRate", service: "api" }, annotations: { summary: "5xx" } }] });
  assert.strictEqual((await req("POST", "/api/alert", { Host: "localhost:7330", "Content-Type": "application/json" }, am)).status, 401);
  const ok = await req("POST", "/api/alert", { Host: "localhost:7330", "Content-Type": "application/json", Authorization: "Bearer " + ALERT }, am);
  assert.strictEqual(ok.status, 202);
  assert.strictEqual(JSON.parse(ok.body).results[0].merged, true);

  // export and doctor
  const csv = await fetch("http://127.0.0.1:7330/api/export?format=csv");
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.strictEqual((await fetch("http://127.0.0.1:7330/api/doctor")).status, 404, "doctor is POST-only");
  const doc = await (await post({}, auth).then(() => fetch("http://127.0.0.1:7330/api/doctor", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, auth), body: "{}" }))).json();
  assert.ok(doc.checks.some((c) => c.check === "config" && c.level === "ok"));
  assert.ok(doc.checks.some((c) => c.check === "remote" && c.level === "ok"));

  // static files carry a CSP; unknown files are 404
  const idx = await fetch("http://127.0.0.1:7330/");
  assert.match(idx.headers.get("content-security-policy"), /script-src 'self'/);
  assert.strictEqual((await fetch("http://127.0.0.1:7330/package.json")).status, 404);
  assert.strictEqual((await fetch("http://127.0.0.1:7330/../wisprops.config.json")).status, 404);
});

test("server: change ledger from CI, freeze, add a service by voice, certificates", { timeout: 60000 }, async (t) => {
  const svc = http.createServer((q, s) => { s.writeHead(200); s.end("ok"); }).listen(7333, "127.0.0.1");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-srv2-"));
  fs.writeFileSync(path.join(dir, "app.env"), "DB_POOL=20\n");
  const ALERT = "c".repeat(24);
  fs.writeFileSync(path.join(dir, "wisprops.config.json"), JSON.stringify({
    port: 7332, settings: { intervalMs: 200 }, alerts: { token: ALERT },
    services: [{ id: "api", health: "http://127.0.0.1:7333/healthz", config: { file: "app.env" } }],
  }));
  const app = start({ config: path.join(dir, "wisprops.config.json"), quiet: true });
  t.after(() => { app.stop(); svc.close(); });
  await sleep(300);
  const base = "http://127.0.0.1:7332";
  const J = { "Content-Type": "application/json" };
  const key = { Authorization: "Bearer " + app.secret };

  // CI reports a change with the alert token; without it, refused
  let r = await fetch(base + "/api/change", { method: "POST", headers: J, body: JSON.stringify({ service: "api", text: "deployed v43", by: "sam" }) });
  assert.strictEqual(r.status, 401);
  r = await fetch(base + "/api/change", { method: "POST", headers: Object.assign({ Authorization: "Bearer " + ALERT }, J), body: JSON.stringify({ service: "api", text: "deployed v43 (pipeline #12)", by: "sam", kind: "deploy" }) });
  assert.strictEqual(r.status, 202);
  assert.ok(app.agent.state.changes.some((c) => c.by === "sam" && /pipeline #12/.test(c.text)));

  // freezing needs a session; there is no unfreeze endpoint at all
  assert.strictEqual((await fetch(base + "/api/freeze", { method: "POST", headers: J, body: "{}" })).status, 401);
  assert.strictEqual((await fetch(base + "/api/freeze", { method: "POST", headers: Object.assign({}, key, J), body: "{}" })).status, 200);
  assert.ok(app.agent.state.frozen);
  assert.strictEqual((await fetch(base + "/api/unfreeze", { method: "POST", headers: Object.assign({}, key, J), body: "{}" })).status, 404);

  // add a service from a sentence; paths outside the folder are refused
  r = await fetch(base + "/api/services", { method: "POST", headers: Object.assign({}, key, J), body: JSON.stringify({ text: "watch the worker on pm2 process worker, health check at localhost 7333 slash healthz, logs in ../../etc/app.log" }) });
  assert.strictEqual(r.status, 400);
  assert.match((await r.json()).error, /inside/);
  r = await fetch(base + "/api/services", { method: "POST", headers: Object.assign({}, key, J), body: JSON.stringify({ text: "watch the worker on pm2 process worker, health check at localhost 7333 slash healthz" }) });
  const added = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(added));
  assert.strictEqual(added.id, "worker");
  assert.ok(added.can.restart);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "wisprops.config.json"), "utf8"));
  assert.deepStrictEqual(saved.services[1].preset, { type: "pm2", name: "worker" });
  const st = await (await fetch(base + "/api/state")).json();
  assert.ok(st.services.some((s) => s.id === "worker"));
  r = await fetch(base + "/api/services", { method: "POST", headers: Object.assign({}, key, J), body: JSON.stringify({ text: "watch the worker on pm2 process worker, health check at localhost 7333 slash healthz" }) });
  assert.strictEqual(r.status, 400);

  assert.strictEqual((await fetch(base + "/api/certificate?id=nope")).status, 404);
});

test("server: review fixes (limiter, forged changes, secrets in state, notes vs rules)", { timeout: 60000 }, async (t) => {
  const svc = http.createServer((q, s) => { s.writeHead(200); s.end("ok"); }).listen(7335, "127.0.0.1");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-srv3-"));
  fs.writeFileSync(path.join(dir, "app.env"), "DB_POOL=20\nSTRIPE_SECRET_KEY=sk_live_abcdefghijklmnop\n");
  const ALERT = "d".repeat(24);
  fs.writeFileSync(path.join(dir, "wisprops.config.json"), JSON.stringify({
    port: 7334, settings: { intervalMs: 200, goldenAfter: 1 }, alerts: { token: ALERT },
    services: [{ id: "api", health: "http://127.0.0.1:7335/healthz", config: { file: "app.env" } }],
  }));
  const app = start({ config: path.join(dir, "wisprops.config.json"), quiet: true });
  t.after(() => { app.stop(); svc.close(); });
  await sleep(900);
  const base = "http://127.0.0.1:7334";
  const J = { "Content-Type": "application/json" };
  const key = { Authorization: "Bearer " + app.secret };

  // 25 bad alert tokens don't lock out the real one
  for (let k = 0; k < 25; k++) await fetch(base + "/api/alert", { method: "POST", headers: Object.assign({ Authorization: "Bearer nope" }, J), body: "{}" });
  const ok = await fetch(base + "/api/alert", { method: "POST", headers: Object.assign({ Authorization: "Bearer " + ALERT }, J), body: JSON.stringify({ service: "api", summary: "test" }) });
  assert.strictEqual(ok.status, 202);

  // a change report from another origin is refused, even with a valid key
  const forged = await fetch(base + "/api/change", { method: "POST", headers: Object.assign({ Origin: "http://localhost:8080" }, key, J), body: JSON.stringify({ service: "api", text: "x", by: "mallory", key: "DB_POOL" }) });
  assert.strictEqual(forged.status, 403);

  // what localhost readers see: secret-looking values masked, no raw log lines
  const st = await (await fetch(base + "/api/state")).json();
  const golden = st.state.svc.api.golden;
  assert.strictEqual(golden.config.STRIPE_SECRET_KEY, "••••");
  assert.strictEqual(golden.config.DB_POOL, "20");
  assert.ok(!("logBase" in golden));
  assert.strictEqual(app.agent.rt("api").golden.config.STRIPE_SECRET_KEY, "sk_live_abcdefghijklmnop", "kept internally to restore it");

  // notes: anyone local may add one, but it only becomes a rule from a signed-in console; removing needs sign-in
  await fetch(base + "/api/runbook", { method: "POST", headers: J, body: JSON.stringify({ serviceId: "api", text: "DB_POOL must never be 20", source: "MCP: x" }) });
  await fetch(base + "/api/runbook", { method: "POST", headers: Object.assign({}, key, J), body: JSON.stringify({ serviceId: "api", text: "DB_POOL must be at least 10" }) });
  const notes = app.agent.state.runbooks.api;
  assert.ok(!notes[0].rule && notes[1].rule);
  assert.strictEqual((await fetch(base + "/api/runbook", { method: "POST", headers: J, body: JSON.stringify({ serviceId: "api", remove: notes[1].id }) })).status, 401);

  // a service added from the console can't point at WisprOps's own files
  for (const p of [".wisprops/secret", "wisprops.config.json", ".git/config"]) {
    const r = await fetch(base + "/api/services", { method: "POST", headers: Object.assign({}, key, J), body: JSON.stringify({ id: "x" + p.length, flags: { health: "http://127.0.0.1:7335/", pm2: "x", logs: p } }) });
    assert.strictEqual(r.status, 400, p);
  }
});
