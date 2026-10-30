/* End-to-end: real demo service + real server + MCP over stdio. Uses ports 7311/7310. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) { /* not yet */ } await sleep(250); } throw new Error("timed out"); }

test("live: config drift is found, refused when typed, fixed on a Wispr approval, verified, and readable over MCP", { timeout: 90000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-live-"));
  fs.cpSync(path.join(ROOT, "demo"), dir, { recursive: true, filter: (s) => !s.includes("runtime") && !s.includes(".wisprops") });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "wisprops.config.json"), "utf8"));
  cfg.port = 7310; cfg.settings.intervalMs = 400; cfg.settings.verifyWindowMs = 15000;
  cfg.services[0].health.url = "http://127.0.0.1:7311/healthz";
  cfg.services[0].repo = ".";
  fs.writeFileSync(path.join(dir, "wisprops.config.json"), JSON.stringify(cfg));
  execFileSync(process.execPath, [path.join(dir, "ctl.js"), "reset"]);
  const g = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
  g("init", "-q", "-b", "main"); g("add", "ctl.js", "patient.js"); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");

  const patient = spawn(process.execPath, [path.join(dir, "patient.js")], { env: Object.assign({}, process.env, { PATIENT_PORT: "7311" }), stdio: "ignore" });
  const server = spawn(process.execPath, [path.join(ROOT, "bin", "wisprops.js"), "start", "--config", path.join(dir, "wisprops.config.json")], { stdio: "ignore" });
  t.after(() => { patient.kill(); server.kill(); });

  const api = "http://127.0.0.1:7310";
  const state = async () => (await fetch(api + "/api/state")).json();
  await until(async () => (await state()).state.svc["checkout-api"].golden, 15000);

  execFileSync(process.execPath, [path.join(dir, "ctl.js"), "break", "config"]);
  const inc = await until(async () => (await state()).state.incidents.find((i) => i.status === "proposed"), 15000);
  assert.strictEqual(inc.cause.kind, "config_drift");

  // writes need a console session, even from localhost
  const anon = await fetch(api + "/api/talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: inc.id, text: "Approve fix one.", meta: { via: "wispr", insert: 16, keys: 0 } }) });
  assert.strictEqual(anon.status, 401);
  const key = fs.readFileSync(path.join(dir, ".wisprops", "secret"), "utf8").trim();
  const talk = async (text, meta) => (await fetch(api + "/api/talk", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ id: inc.id, text, meta }) })).json();
  let r = await talk("approve fix 1", { via: "typed", insert: 1, keys: 13 });
  assert.match(r.reply, /Refused/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "runtime", "config.json"), "utf8")).db_pool, 0);

  r = await talk("Approve fix one.", { via: "wispr", insert: 16, keys: 0 });
  assert.match(r.reply, /Say it back/);
  const back = "Approve fix one, db_pool back to 20.";
  r = await talk(back, { via: "wispr", insert: back.length, keys: 0 });
  assert.match(r.reply, /Applying fix 1/);
  await until(async () => (await state()).state.incidents.find((i) => i.id === inc.id).status === "resolved", 20000);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "runtime", "config.json"), "utf8")).db_pool, 20);

  // "open the pull request" commits the postmortem on a new branch via a throwaway worktree
  r = await talk("Open the pull request.", { via: "wispr", insert: 22, keys: 0 });
  assert.match(r.reply, /Committed the postmortem/);
  const branch = r.reply.match(/branch (\S+)\./)[1];
  const files = execFileSync("git", ["-C", dir, "show", "--name-only", "--format=", branch]).toString();
  assert.match(files, /postmortems\/.*inc-1\.md/);
  assert.strictEqual(execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]).toString().trim(), "main", "your checkout stays on its branch");

  // writes from another origin are refused
  const evil = await fetch(api + "/api/talk", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: "{}" });
  assert.strictEqual(evil.status, 403);

  // MCP over stdio
  const mcp = spawn(process.execPath, [path.join(ROOT, "bin", "wisprops.js"), "mcp", "--url", api], { stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => mcp.kill());
  const replies = [];
  let buf = "";
  mcp.stdout.on("data", (d) => { buf += d; let k; while ((k = buf.indexOf("\n")) >= 0) { replies.push(JSON.parse(buf.slice(0, k))); buf = buf.slice(k + 1); } });
  const rpc = (id, method, params) => mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  rpc(2, "tools/list", {});
  rpc(3, "tools/call", { name: "add_incident_note", arguments: { id: inc.id, text: "From my Wispr scratchpad: deploy-bot ran the staging profile against prod.", source: "Wispr Flow scratchpad" } });
  await until(() => replies.length >= 3, 10000);
  rpc(4, "tools/call", { name: "get_postmortem", arguments: { id: inc.id } });
  await until(() => replies.length >= 4, 10000);
  const byId = (id) => replies.find((x) => x.id === id);
  assert.strictEqual(byId(1).result.serverInfo.name, "wisprops");
  assert.ok(!byId(2).result.tools.some((x) => /approve|apply|undo/.test(x.name)), "no tool can approve or apply");
  assert.match(byId(3).result.content[0].text, /attached/);
  assert.match(byId(4).result.content[0].text, /staging profile/);
  assert.match(byId(4).result.content[0].text, /“Approve fix one, db_pool back to 20\.” via Wispr Flow/);
});
