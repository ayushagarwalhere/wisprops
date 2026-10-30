const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createAgent, auditRows, toCSV } = require("../src/agent.js");
const { createSim } = require("../src/sim.js");
const { parseAlerts } = require("../server/alerts.js");
const { normalize, serviceFromFlags } = require("../server/config.js");
const { createAdapters, RELEASE_ID, parseEnv, writeEnv } = require("../server/adapters.js");

function setup(settings) {
  let t = Date.parse("2026-10-29T23:00:00Z");
  const now = () => t;
  const sim = createSim({ now, settings: Object.assign({ sayItBack: false }, settings) });
  const pages = [];
  const adapters = Object.assign({}, sim.adapters, { notify: async (m) => pages.push(m), digest: async (s) => crypto.createHash("sha256").update(s).digest("hex") });
  const agent = createAgent({ config: sim.config, adapters });
  const tick = async (n = 1) => { for (let k = 0; k < n; k++) { t += 5000; await agent.tick(); } };
  return { sim, agent, tick, pages, advance: (ms) => { t += ms; } };
}
const WISPR = (text) => ({ via: "wispr", insert: text.length, keys: 0 });
const TYPED = (text) => ({ via: "typed", insert: 1, keys: text.length });

test("an unacknowledged page escalates once; saying “I'm on it” stops it", async () => {
  const { sim, agent, tick, pages, advance } = setup({ escalateAfterMin: 10 });
  await tick(3);
  sim.faults.config.run();
  await tick(2);
  const inc = agent.state.incidents[0];
  advance(9 * 60000); await tick();
  assert.strictEqual(pages.filter((p) => p.kind === "escalate").length, 0);
  advance(2 * 60000); await tick(); await tick();
  assert.strictEqual(pages.filter((p) => p.kind === "escalate").length, 1, "backup paged exactly once");
  assert.ok(inc.escalatedAt);

  // second incident: acknowledged by voice, never escalates
  const b = setup({ escalateAfterMin: 10 });
  await b.tick(3); b.sim.faults.deploy.run(); await b.tick(2);
  const i2 = b.agent.state.incidents[0];
  const r = await b.agent.command("Main dekh raha hoon", WISPR("Main dekh raha hoon"), i2.id);
  assert.match(r.reply, /Acknowledged/);
  assert.ok(i2.ackAt);
  b.advance(30 * 60000); await b.tick();
  assert.strictEqual(b.pages.filter((p) => p.kind === "escalate").length, 0);
  assert.ok(b.agent.stats().mttaMs >= 0);
});

test("a snoozed service is watched but never pages; resume paging brings it back", async () => {
  const { sim, agent, tick, pages } = setup();
  await tick(3);
  let r = await agent.command("Snooze checkout api for thirty minutes", WISPR("Snooze checkout api for thirty minutes"));
  assert.match(r.reply, /Snoozed checkout-api for 30 min/);
  sim.faults.config.run();
  await tick(4);
  assert.strictEqual(agent.state.incidents.length, 0, "no incident while snoozed");
  assert.strictEqual(agent.rt("checkout-api").status, "failing", "still watched");
  r = await agent.command("resume paging", TYPED("resume paging"));
  assert.match(r.reply, /back on/);
  await tick(2);
  assert.strictEqual(agent.state.incidents.length, 1);
  assert.strictEqual(pages.filter((p) => p.kind === "page").length, 1);
});

test("pausing standing orders makes a covered failure page you", async () => {
  const { sim, agent, tick, pages } = setup();
  await tick(3);
  sim.faults.config.run(); await tick(2);
  const inc = agent.state.incidents[0];
  await agent.command("Approve fix one.", WISPR("Approve fix one."), inc.id);
  await tick(3);
  await agent.command("Grant standing order for 7 days", WISPR("Grant standing order for 7 days"), inc.id);
  assert.strictEqual(agent.state.orders.length, 1);
  await agent.command("Pause standing orders.", TYPED("Pause standing orders."));
  assert.strictEqual(agent.state.ordersPaused, true);
  await tick(3);
  sim.faults.config.run(); await tick(2);
  const inc2 = agent.state.incidents[1];
  assert.strictEqual(inc2.orderId, null);
  assert.strictEqual(inc2.woken, true);
  assert.strictEqual(pages.filter((p) => p.kind === "page").length, 2);
  assert.ok(inc2.timeline.some((t) => /standing orders are paused/.test(t.text)));
});

test("standing orders are capped by policy", async () => {
  const { sim, agent, tick } = setup({ maxOrderDays: 3, maxOrderUses: 2 });
  await tick(3); sim.faults.config.run(); await tick(2);
  const inc = agent.state.incidents[0];
  await agent.command("approve fix one", WISPR("approve fix one"), inc.id); await tick(3);
  await agent.command("grant standing order for thirty days five times", WISPR("grant standing order for thirty days five times"), inc.id);
  const o = agent.state.orders[0];
  assert.strictEqual(o.usesLeft, 2);
  assert.ok(o.expires - o.granted <= 3 * 86400000);
});

test("external alerts: a passing health check with no change escalates honestly; a real failure gets a fix", async () => {
  const { sim, agent, tick, pages } = setup();
  await tick(3);
  let r = await agent.alert("auth", sim.faults.alert.alert);
  const i = agent.state.incidents.find((x) => x.id === r.incidentId);
  assert.strictEqual(i.cause.kind, "external_alert");
  assert.strictEqual(i.status, "escalated");
  assert.strictEqual(i.proposals.length, 0, "no guess at a fix");
  assert.strictEqual(i.source, "Grafana");
  assert.strictEqual(pages.filter((p) => p.kind === "page").length, 1);
  r = await agent.alert("auth", { source: "Grafana", summary: "still slow" });
  assert.strictEqual(r.merged, true);

  sim.faults.deploy.run();
  r = await agent.alert("checkout api", { source: "Alertmanager", summary: "HighErrorRate" });
  const j = agent.state.incidents.find((x) => x.id === r.incidentId);
  assert.strictEqual(j.cause.kind, "bad_deploy");
  assert.strictEqual(j.proposals[0].action.kind, "rollback");
  assert.strictEqual((await agent.alert("nope", {})).ok, false);
});

test("runbook notes dictated for a service show up as evidence", async () => {
  const { sim, agent, tick } = setup();
  agent.addRunbook("checkout-api", "db_pool must stay above 10 since the October migration", "dictated with Wispr Flow");
  await tick(3); sim.faults.config.run(); await tick(2);
  const inc = agent.state.incidents[0];
  // A note with a number in it becomes a rule; when the value breaks it, it is quoted as such.
  assert.ok(inc.evidence.some((e) => e.kind === "rule" && /October migration/.test(e.text) && /breaks it/.test(e.text)));
  agent.addRunbook("auth", "If auth falls over at night, page Priya before restarting twice.", "typed");
  assert.ok(!agent.state.runbooks.auth[0].rule);
});

test("the command line routes to the open incident and keeps handoff notes", async () => {
  const { sim, agent, tick } = setup();
  let r = await agent.command("approve fix one", WISPR("approve fix one"));
  assert.match(r.reply, /no open incident/);
  await tick(3); sim.faults.crash.run(); await tick(2);
  r = await agent.command("note: auth OOMs every Tuesday after the batch job", WISPR("note: auth OOMs every Tuesday after the batch job"));
  assert.match(r.reply, /Noted/);
  r = await agent.command("approve fix one", WISPR("approve fix one"));
  assert.match(r.reply, /Applying fix 1/);
  await tick(4);
  assert.match(agent.handoff(0), /OOMs every Tuesday/);
  assert.match(agent.postmortem(agent.state.incidents[0]), /dictated with Wispr Flow/);
  r = await agent.command("What happened last night?", WISPR("What happened last night?"));
  assert.match(r.reply, /Good morning/);
});

test("audit export covers fixes and standing orders, and CSV is injection-safe", async () => {
  const { sim, agent, tick } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  const inc = agent.state.incidents[0];
  await agent.command("=approve fix one", WISPR("=approve fix one"), inc.id);
  await tick(3);
  await agent.command("grant standing order for seven days", WISPR("grant standing order for seven days"), inc.id);
  await agent.revokeOrder("so-1");
  const rows = auditRows(agent.state);
  assert.deepStrictEqual(rows.map((r) => r.type), ["fix", "standing order granted", "standing order revoked"]);
  const csv = toCSV(rows);
  assert.match(csv, /"'=approve fix one"/, "formula-looking cells are neutralised");
});

test("alert parser understands Alertmanager, Grafana, Uptime Kuma and a generic body", () => {
  const am = parseAlerts({ status: "firing", alerts: [{ status: "firing", labels: { alertname: "HighErrorRate", service: "checkout-api" }, annotations: { summary: "5xx over 5%" } }, { status: "resolved", labels: { service: "auth" } }] });
  assert.deepStrictEqual(am, [{ service: "checkout-api", source: "Alertmanager", summary: "HighErrorRate: 5xx over 5%" }]);
  assert.strictEqual(parseAlerts({ orgId: 1, alerts: [{ status: "firing", labels: { alertname: "Latency", app: "auth" } }] })[0].source, "Grafana");
  assert.deepStrictEqual(parseAlerts({ monitor: { name: "auth" }, heartbeat: { status: 0, msg: "timeout" } }), [{ service: "auth", source: "Uptime Kuma", summary: "timeout" }]);
  assert.deepStrictEqual(parseAlerts({ monitor: { name: "auth" }, heartbeat: { status: 1 } }), []);
  assert.strictEqual(parseAlerts({ service: "x", summary: "y" })[0].source, "webhook");
  assert.strictEqual(parseAlerts({ summary: "y" }, "forced")[0].service, "forced");
});

test("presets expand into argument arrays; explicit fields win; bad names are refused", () => {
  const cfg = normalize({ services: [
    { id: "api", health: "http://localhost:3000/healthz", preset: { type: "docker", container: "api" } },
    { id: "web", health: { url: "http://localhost:8080/" }, preset: { type: "kubernetes", deployment: "web", namespace: "prod" }, restart: ["./my-restart.sh"] },
  ] });
  assert.deepStrictEqual(cfg.services[0].restart, ["docker", "restart", "api"]);
  assert.deepStrictEqual(cfg.services[1].restart, ["./my-restart.sh"]);
  assert.deepStrictEqual(cfg.services[1].rollback, ["kubectl", "set", "image", "deployment/web", "web={to}", "-n", "prod"]);
  assert.strictEqual(cfg.services[1].can.rollback, true);
  assert.throws(() => normalize({ services: [{ id: "x", health: "http://a/", preset: { type: "docker", container: "--privileged" } }] }), /preset docker/);
  assert.throws(() => normalize({ services: [{ id: "x", health: "http://a/", restart: "docker restart x" }] }), /array of strings/);
  assert.throws(() => normalize({ access: { hosts: ["ops.example.com"], token: "short" }, services: [{ id: "x", health: "http://a/" }] }), /16 characters/);
  assert.deepStrictEqual(serviceFromFlags("w", { health: "http://a/", pm2: "worker", watch: ".env" }).preset, { type: "pm2", name: "worker" });
  assert.ok(RELEASE_ID.test("ghcr.io/acme/api:1.4.2"));
  assert.ok(!RELEASE_ID.test("--output=/etc/passwd"));
  assert.ok(!RELEASE_ID.test("v1; rm -rf /"));
});

test("nested JSON keys and .env files are watched and restored in place", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisprops-cfg-"));
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify({ db: { pool: 20, host: "db" }, cache: 60 }));
  fs.writeFileSync(path.join(dir, ".env"), "# comment\nexport PORT=3000\nDB_POOL=20 # keep above 10\nGREETING=\"hello world\"\n");
  const A = createAdapters({}, dir, {});
  const j = { config: { file: "app.json" } }, e = { config: { file: ".env" } };
  assert.deepStrictEqual(await A.readConfig(j), { "db.pool": 20, "db.host": "db", cache: 60 });
  assert.deepStrictEqual(await A.readConfig(e), { PORT: "3000", DB_POOL: "20", GREETING: "hello world" });
  assert.strictEqual((await A.dryRun(j, { kind: "restore_config", key: "db.pool", value: 20, from: 20 })).ok, true);
  await A.exec(j, { kind: "restore_config", key: "db.pool", value: 5 });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "app.json"), "utf8")).db.pool, 5);
  await A.exec(e, { kind: "restore_config", key: "DB_POOL", value: "0" });
  const env = fs.readFileSync(path.join(dir, ".env"), "utf8");
  assert.match(env, /^DB_POOL=0$/m);
  assert.match(env, /^# comment$/m, "comments kept");
  assert.match(env, /^export PORT=3000$/m, "other lines kept");
  assert.deepStrictEqual(parseEnv(writeEnv("A=1\n", "B", "two words")), { A: "1", B: "two words" });
  await assert.rejects(async () => { const r = await A.exec(j, { kind: "restore_config", key: "__proto__.polluted", value: 1 }); if (!r.ok) throw new Error(r.output); }, /refusing/);
});

test("an incident fixed by hand closes itself and withdraws the pending fix", async () => {
  const { sim, agent, tick, pages } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  const inc = agent.state.incidents[0];
  assert.strictEqual(inc.status, "proposed");
  sim.svcs["checkout-api"].config.db_pool = 20; // someone fixed it by hand
  await tick(3);
  assert.strictEqual(inc.status, "recovered on its own");
  assert.strictEqual(inc.proposals[0].state, "withdrawn");
  assert.strictEqual(pages.filter((p) => p.kind === "resolved").length, 1);
  const r = await agent.talk(inc.id, "approve fix one", WISPR("approve fix one"));
  assert.match(r.reply, /withdrawn/);
  sim.faults.config.run(); await tick(2);
  assert.strictEqual(agent.state.incidents.length, 2, "the next failure opens a new incident");
});

test("approvals never land on a guessed incident; snoozing acknowledges and stops escalation", async () => {
  const { sim, agent, tick, pages, advance } = setup({ escalateAfterMin: 10 });
  await tick(3);
  sim.faults.config.run(); sim.faults.crash.run();
  await tick(2);
  assert.strictEqual(agent.state.incidents.length, 2);
  let r = await agent.command("approve fix one", WISPR("approve fix one"));
  assert.match(r.reply, /2 incidents are waiting/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0, "nothing applied");
  r = await agent.command("don't approve fix one", WISPR("don't approve fix one"), agent.state.incidents[0].id);
  assert.match(r.reply, /nothing was changed/);
  const auth = agent.state.incidents.find((i) => i.serviceId === "auth");
  await agent.command("snooze auth for an hour", WISPR("snooze auth for an hour"), auth.id);
  assert.ok(auth.ackAt, "answering acknowledges");
  advance(20 * 60000); await tick();
  assert.strictEqual(pages.filter((p) => p.kind === "escalate" && p.incidentId === auth.id).length, 0);
});

test("resuming standing orders and opening a PR need Wispr; a restart mid-apply escalates", async () => {
  const { sim, agent, tick } = setup();
  await agent.command("pause standing orders", TYPED("pause standing orders"));
  let r = await agent.command("resume standing orders", TYPED("resume standing orders"));
  assert.match(r.reply, /Refused/);
  assert.strictEqual(agent.state.ordersPaused, true);
  r = await agent.command("resume standing orders", WISPR("resume standing orders"));
  assert.strictEqual(agent.state.ordersPaused, false);
  await tick(3); sim.faults.config.run(); await tick(2);
  const inc = agent.state.incidents[0];
  r = await agent.command("open the pull request", TYPED("open the pull request"), inc.id);
  assert.match(r.reply, /Refused/);
  // simulate a crash mid-apply, then a fresh agent on the saved state
  inc.status = "applying"; inc.proposals[0].state = "approved";
  const again = createAgent({ config: sim.config, adapters: Object.assign({}, sim.adapters, { notify: async () => {} }), state: agent.state });
  await again.tick();
  assert.strictEqual(inc.status, "escalated");
  assert.strictEqual(inc.proposals[0].state, "interrupted");
});

test("handoff lists incidents still open from before the window", async () => {
  const { sim, agent, tick, advance } = setup();
  await tick(3); sim.faults.crash.run(); await tick(2);
  await agent.command("I'll handle it", WISPR("I'll handle it"));
  sim.faults.deploy.run(); await tick(2);
  advance(20 * 3600000);
  assert.match(agent.handoff(), /Still needs you: .*checkout-api \(proposed\)/);
  assert.strictEqual(agent.state.incidents.filter((i) => i.serviceId === "auth").length, 1, "no re-page after “I'll handle it”");
});

test("with nothing selected, a spoken grant goes to the last verified fix, and the repeat isn't asked about", async () => {
  const { sim, agent, tick } = setup();
  let r = await agent.command("grant standing order for seven days", WISPR("grant standing order for seven days"));
  assert.match(r.reply, /no verified fix/i, "nothing to grant yet, said plainly");
  await tick(3); sim.faults.config.run(); await tick(2);
  await agent.command("approve fix one", WISPR("approve fix one"));
  await tick(4);
  assert.strictEqual(agent.state.incidents[0].status, "resolved");
  // as after a page reload: no incident id passed
  r = await agent.command("grant standing order for seven days", WISPR("grant standing order for seven days"));
  assert.match(r.reply, /Granted so-1/);
  sim.faults.config.run(); await tick(6);
  const repeat = agent.state.incidents[1];
  assert.strictEqual(repeat.orderId, "so-1");
  const fixLine = repeat.timeline.find((e) => /^Fix 1:/.test(e.text));
  assert.ok(fixLine && !/Say “approve fix/.test(fixLine.text) && /standing order covers this/.test(fixLine.text), "no pointless request for a yes");
});
