/* First-run and everyday-use paths: an empty config, TCP and command health checks, the test page. Ports 7336-7339. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { normalize } = require("../server/config.js");
const { createAdapters } = require("../server/adapters.js");
const { start } = require("../server/server.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("health checks: TCP port and a command that exits 0", async (t) => {
  const tcp = net.createServer((s) => s.end()).listen(7337, "127.0.0.1");
  t.after(() => tcp.close());
  const cfg = normalize({ services: [
    { id: "db", health: "tcp://127.0.0.1:7337" },
    { id: "down", health: "tcp://127.0.0.1:7338" },
    { id: "ok", health: { command: [process.execPath, "-e", "process.exit(0)"] } },
    { id: "bad", health: { command: [process.execPath, "-e", "console.log('replica lag 40s'); process.exit(2)"] } },
  ] });
  assert.deepStrictEqual(cfg.services.map((s) => s.healthLabel.split(" ")[0]), ["TCP", "TCP", "runs", "runs"]);
  const A = createAdapters(cfg, os.tmpdir(), {});
  const [db, down, ok, bad] = await Promise.all(cfg.services.map((s) => A.probe(s)));
  assert.ok(db.ok);
  assert.strictEqual(down.ok, false); assert.match(down.error, /ECONNREFUSED/);
  assert.ok(ok.ok);
  assert.strictEqual(bad.ok, false); assert.strictEqual(bad.status, 2); assert.match(bad.detail, /replica lag/);
  assert.throws(() => normalize({ services: [{ id: "x", health: "ftp://nope" }] }), /health check/);
  assert.deepStrictEqual(normalize({}).services, []);
});

test("first run: no services, add one from the console, send a test page", { timeout: 60000 }, async (t) => {
  const got = [];
  const ntfy = http.createServer((q, s) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => { got.push({ path: q.url, title: q.headers.title, body: b }); s.end("{}"); }); }).listen(7339, "127.0.0.1");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-first-"));
  fs.writeFileSync(path.join(dir, "wisprops.config.json"), JSON.stringify({ port: 7336, settings: { intervalMs: 200 }, notify: { ntfy: "my-topic", ntfyServer: "http://127.0.0.1:7339" }, services: [] }));
  const app = start({ config: path.join(dir, "wisprops.config.json"), quiet: true });
  t.after(() => { app.stop(); ntfy.close(); });
  await sleep(300);
  const base = "http://127.0.0.1:7336", J = { "Content-Type": "application/json" }, key = { Authorization: "Bearer " + app.secret };
  let st = await (await fetch(base + "/api/state")).json();
  assert.strictEqual(st.services.length, 0);

  const r = await fetch(base + "/api/services", { method: "POST", headers: Object.assign({}, key, J), body: JSON.stringify({ text: "watch my postgres database on localhost 7338" }) });
  const added = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(added));
  st = await (await fetch(base + "/api/state")).json();
  assert.strictEqual(st.services[0].health, "TCP localhost:7338");

  const tp = await (await fetch(base + "/api/test-page", { method: "POST", headers: Object.assign({}, key, J), body: "{}" })).json();
  assert.deepStrictEqual(tp.results, [{ channel: "ntfy", ok: true }]);
  assert.strictEqual(got[0].path, "/my-topic");
  assert.strictEqual(got[0].title, "WisprOps test page");
  assert.strictEqual((await fetch(base + "/api/test-page", { method: "POST", headers: J, body: "{}" })).status, 401);
});

test("settings from the console: channels apply live; safety switches can't be loosened from a browser", { timeout: 60000 }, async (t) => {
  const got = [];
  const ntfy = http.createServer((q, s) => { got.push(q.url); s.end("{}"); }).listen(7338, "127.0.0.1");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-settings-"));
  const file = path.join(dir, "wisprops.config.json");
  fs.writeFileSync(file, JSON.stringify({ port: 7340, settings: { intervalMs: 200 }, notify: { webhook: "$NOT_SET_HERE" }, services: [] }));
  const app = start({ config: file, quiet: true });
  t.after(() => { app.stop(); ntfy.close(); });
  await sleep(300);
  const base = "http://127.0.0.1:7340", J = { "Content-Type": "application/json" }, key = { Authorization: "Bearer " + app.secret };
  const post = (body, h) => fetch(base + "/api/settings", { method: "POST", headers: Object.assign({}, h || key, J), body: JSON.stringify(body) });

  assert.strictEqual((await post({ notify: { ntfy: "x" } }, {})).status, 401);
  assert.strictEqual((await post({ notify: { ntfy: "bad topic!" } })).status, 400);
  assert.strictEqual((await post({ notify: { webhook: "http://insecure" } })).status, 400);
  assert.strictEqual((await post({ settings: { handoffHour: 31 } })).status, 400);

  const r = await post({ notify: { ntfy: "wisprops-abc123", ntfyServer: "http://127.0.0.1:7338" }, settings: { escalateAfterMin: 5, handoffHour: 6, allowTyped: true, maxOrderDays: 365 } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(app.agent.settings.escalateAfterMin, 5);
  assert.strictEqual(app.agent.settings.allowTyped, false, "allowTyped is config-file only");
  assert.strictEqual(app.agent.settings.maxOrderDays, 30, "caps are config-file only");
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.strictEqual(saved.notify.ntfy, "wisprops-abc123");
  assert.strictEqual(saved.notify.webhook, "$NOT_SET_HERE", "untouched values keep their $ENV reference");
  assert.ok(!("allowTyped" in saved.settings));

  const st = await (await fetch(base + "/api/state")).json();
  assert.ok(st.channels.ntfy && st.channels.hints.ntfy && !JSON.stringify(st).includes("wisprops-abc123"), "the topic is never echoed back");
  const tp = await (await fetch(base + "/api/test-page", { method: "POST", headers: Object.assign({}, key, J), body: "{}" })).json();
  assert.deepStrictEqual(tp.results, [{ channel: "ntfy", ok: true }]);
  assert.deepStrictEqual(got, ["/wisprops-abc123"]);
});
