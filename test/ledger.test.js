// Change ledger, log reduction, memory, freeze, renewals, dictated rules, redaction, voice navigation.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const W = require("../src/agent.js");
const { createSim } = require("../src/sim.js");

function setup(settings, patch) {
  let t = Date.parse("2026-10-29T23:00:00Z");
  const now = () => t;
  const sim = createSim({ now, settings: Object.assign({ sayItBack: false }, settings) });
  const pages = [];
  const adapters = Object.assign({}, sim.adapters, { notify: async (m) => pages.push(m), digest: async (s) => crypto.createHash("sha256").update(s).digest("hex") }, patch || {});
  const agent = W.createAgent({ config: sim.config, adapters });
  const tick = async (n = 1) => { for (let k = 0; k < n; k++) { t += 5000; await agent.tick(); } };
  return { sim, agent, tick, pages, advance: (ms) => { t += ms; }, now };
}
const WISPR = (text) => ({ via: "wispr", insert: text.length, keys: 0 });
const TYPED = (text) => ({ via: "typed", insert: 1, keys: text.length });
const last = (agent) => agent.state.incidents[agent.state.incidents.length - 1];

test("the change ledger says who changed it, and reported changes from CI show up as evidence", async () => {
  const { sim, agent, tick } = setup();
  await tick(3);
  await agent.reportChange("checkout-api", { kind: "deploy", text: "deploy pipeline #771 applied config profile staging", by: "ci", source: "GitHub Actions" });
  sim.faults.config.run();
  await tick(2);
  const i = last(agent);
  assert.strictEqual(i.cause.kind, "config_drift");
  assert.match(i.cause.summary, /Changed by/);
  const ev = i.evidence.find((e) => e.kind === "changes");
  assert.ok(ev && /pipeline #771/.test(ev.text) && /db_pool 20 → 0/.test(ev.text), ev && ev.text);
  assert.ok(agent.state.changes.some((c) => c.source === "detected" && c.key === "db_pool" && c.incidentId === i.id));
  const r = await agent.command("what changed?", TYPED("what changed?"));
  assert.match(r.reply, /db_pool 20 → 0/);
  assert.ok(agent.postmortem(i).includes("## Changes before it broke"));
});

test("a release change is attributed to whoever shipped it", async () => {
  const { sim, agent, tick } = setup();
  await tick(3); sim.faults.deploy.run(); await tick(2);
  const i = last(agent);
  assert.strictEqual(i.cause.kind, "bad_deploy");
  assert.match(i.cause.summary, /GitHub Actions \(merge of #418 by sam\)/);
});

test("log reduction keeps the few lines that are errors and new since healthy", async () => {
  const r = W.reduceLogs([
    "10:00:01 INFO GET /api/cart/1001 200 20ms", "10:00:02 INFO GET /api/cart/1002 200 22ms",
    "10:00:03 WARN request 4001 waited 3000ms for a db connection", "10:00:03 ERROR db pool exhausted (db_pool=0), request failed",
    "10:00:04 WARN request 4002 waited 3000ms for a db connection", "10:00:04 ERROR db pool exhausted (db_pool=0), request failed",
    "10:00:05 ERROR db pool exhausted (db_pool=0), request failed",
  ], ["09:00:01 INFO GET /api/cart/1003 200 20ms"], 3);
  assert.strictEqual(r.total, 7);
  assert.match(r.kept[0].line, /db pool exhausted/);
  assert.strictEqual(r.kept[0].count, 3);
  assert.ok(r.kept[0].novel);
  assert.ok(!r.kept.some((k) => /INFO GET/.test(k.line)));

  const { sim, agent, tick } = setup();
  await tick(4); sim.faults.config.run(); await tick(2);
  const ev = last(agent).evidence.find((e) => e.kind === "logs");
  assert.match(ev.text, /that matter \(of \d+\)/);
  assert.match(ev.text, /new since healthy/);
});

test("memory: the second time the same thing breaks, it says so and quotes the last approval", async () => {
  const { sim, agent, tick } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  await agent.talk(last(agent).id, "Approve fix one.", WISPR("Approve fix one."));
  await tick(4);
  assert.strictEqual(last(agent).status, "resolved");
  await tick(3); sim.faults.config.run(); await tick(2);
  const j = last(agent);
  assert.strictEqual(j.recurrence.count, 2);
  const m = j.evidence.find((e) => e.kind === "memory");
  assert.match(m.text, /2nd time in 7 days/);
  assert.match(m.text, /Approved by “Approve fix one\.” via Wispr Flow/);
});

test("freeze: anyone can freeze; nothing applies; unfreezing needs Wispr", async () => {
  const { sim, agent, tick, pages } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  const i = last(agent);
  let r = await agent.command("freeze production", TYPED("freeze production"));
  assert.match(r.reply, /frozen/);
  r = await agent.talk(i.id, "Approve fix one.", WISPR("Approve fix one."));
  assert.match(r.reply, /frozen/);
  assert.strictEqual(i.proposals[0].state, "pending");
  assert.strictEqual(agent.state.receipts.length, 0);
  r = await agent.command("unfreeze production", TYPED("unfreeze production"));
  assert.match(r.reply, /Refused/);
  assert.ok(agent.state.frozen);
  r = await agent.command("Unfreeze production.", WISPR("Unfreeze production."));
  assert.match(r.reply, /Unfrozen/);
  r = await agent.talk(i.id, "Approve fix one.", WISPR("Approve fix one."));
  assert.match(r.reply, /Applying/);
  assert.ok(pages.length >= 1);
});

test("a frozen production pages instead of using a standing order; config can hard-disable changes", async () => {
  const { sim, agent, tick, pages } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  await agent.talk(last(agent).id, "Approve fix one.", WISPR("Approve fix one."));
  await tick(4);
  await agent.talk(last(agent).id, "Grant standing order for seven days.", WISPR("Grant standing order for seven days."));
  await agent.freeze("button");
  await tick(3); sim.faults.config.run(); await tick(2);
  const j = last(agent);
  assert.ok(!j.orderId);
  assert.ok(j.woken);
  assert.ok(j.timeline.some((t) => /would cover this, but Production is frozen/.test(t.text)));

  const h = setup({ applyEnabled: false });
  const r = await h.agent.command("Unfreeze production.", WISPR("Unfreeze production."));
  assert.match(r.reply, /Voice can't override/);
  assert.match(h.agent.statusLine(), /switched off in the config/);
  assert.ok(pages.some((p) => p.kind === "page"));
});

test("renewing a standing order needs Wispr; expiry is announced with the words to renew it", async () => {
  const { sim, agent, tick, pages, advance } = setup({ maxOrderDays: 30 });
  await tick(3); sim.faults.config.run(); await tick(2);
  await agent.talk(last(agent).id, "Approve fix one.", WISPR("Approve fix one."));
  await tick(4);
  await agent.talk(last(agent).id, "Grant standing order for two days.", WISPR("Grant standing order for two days."));
  const o = agent.state.orders[0];
  advance(26 * 3600000); await tick(1);
  const warn = pages.find((p) => p.kind === "order");
  assert.ok(warn, "expiry warning sent");
  assert.match(warn.body, /renew standing order so 1 for seven days/);
  let r = await agent.command("renew standing order so 1 for seven days", TYPED("renew standing order so 1 for seven days"));
  assert.match(r.reply, /Refused/);
  const before = o.expires;
  r = await agent.command("Renew standing order so 1 for seven days, only at night.", WISPR("Renew standing order so 1 for seven days, only at night."));
  assert.match(r.reply, /Renewed so-1/);
  assert.ok(o.expires > before);
  assert.ok(o.window && o.renewals.length === 1);
});

test("a nights-only standing order does not act during the day", async () => {
  const base = Date.parse("2026-10-29T23:00:00Z");
  const h = new Date(base).getHours();
  const { sim, agent, tick } = setup({ nightFrom: (h + 3) % 24, nightTo: (h + 6) % 24 });
  await tick(3); sim.faults.config.run(); await tick(2);
  await agent.talk(last(agent).id, "Approve fix one.", WISPR("Approve fix one."));
  await tick(4);
  const r = await agent.talk(last(agent).id, "Grant standing order for seven days only at night.", WISPR("Grant standing order for seven days only at night."));
  assert.match(r.reply, /Granted/);
  assert.ok(agent.state.orders[0].window);
  await tick(3); sim.faults.config.run(); await tick(2);
  const j = last(agent);
  assert.ok(!j.orderId);
  assert.ok(j.timeline.some((t) => /only covers nights/.test(t.text)));
});

test("an unexplained failure gets a restart labelled as a remedy, and no standing order for it", async () => {
  let broken = false;
  const probe = createSim().adapters.probe;
  const { agent, tick } = setup(null, { probe: async (svc) => (broken && svc.id === "auth" ? { ok: false, status: 503 } : probe(svc)) });
  await tick(3); broken = true; await tick(2);
  const i = last(agent);
  assert.strictEqual(i.cause.kind, "errors");
  assert.ok(i.proposals[0].action.remedy);
  assert.match(i.proposals[0].describe, /best guess, not a root cause/);
});

test("rules you dictate: the snapshot never takes a bad value, and a broken rule is fixed to its edge", async () => {
  const { sim, agent, tick } = setup();
  agent.addRunbook("checkout-api", "db_pool must stay at 10 or more since the October migration.", "dictated with Wispr Flow");
  await tick(3);
  assert.strictEqual(agent.rt("checkout-api").golden.config.db_pool, 20);
  sim.svcs["checkout-api"].config.db_pool = 5; // still healthy, but breaks the rule
  await tick(3);
  assert.strictEqual(agent.rt("checkout-api").golden.config.db_pool, 20, "bad value kept out of the snapshot");
  assert.ok(agent.state.activity.some((a) => /your rule: db_pool at least 10/.test(a.text)));
  sim.faults.config.run(); await tick(2);
  const i = last(agent);
  assert.strictEqual(i.proposals[0].action.value, 20);
  assert.ok(i.evidence.some((e) => e.kind === "rule"));

  // A golden snapshot that was already wrong: the rule supplies the value.
  const g = setup();
  g.sim.svcs["checkout-api"].config.db_pool = 0;
  await g.tick(1);
  g.agent.addRunbook("checkout-api", "db pool must be at least 10", "typed");
  await g.tick(2);
  const k = last(g.agent);
  assert.strictEqual(k.cause.kind, "rule_broken");
  assert.strictEqual(k.proposals[0].action.value, 10);
  assert.match(k.proposals[0].describe, /edge of your rule/);
});

test("speech: Devanagari command words, navigation, selection; Hindi cardinals are not mapped", async () => {
  assert.deepStrictEqual(W.parseIntent("अप्रूव फिक्स वन।"), { kind: "approve", n: 1 });
  assert.notStrictEqual(W.parseIntent("अप्रूव फिक्स दो").kind, "approve");
  assert.strictEqual(W.parseIntent("मैं देख रहा हूँ").kind, "ack");
  assert.deepStrictEqual(W.parseIntent("open the audit log"), { kind: "go", page: "receipts" });
  assert.deepStrictEqual(W.parseIntent("show me standing orders"), { kind: "go", page: "orders" });
  assert.deepStrictEqual(W.parseIntent("open incident two"), { kind: "select", n: 2 });
  assert.strictEqual(W.parseIntent("should I unfreeze production?").kind, "unclear");
  assert.strictEqual(W.parseIntent("don't renew standing order").kind, "unclear");
  for (const k of ["approve", "undo", "grant", "renew", "unfreeze", "resumeOrders", "pr"]) assert.ok(W.CONSENT_KINDS.includes(k));

  const { sim, agent, tick } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  const i = last(agent);
  const r = await agent.command("अप्रूव फिक्स वन", WISPR("अप्रूव फिक्स वन"), i.id);
  assert.match(r.reply, /Applying fix 1/);
  const g = await agent.command("open incident one", TYPED("open incident one"));
  assert.strictEqual(g.select, i.id);
  assert.strictEqual((await agent.command("go to analytics", TYPED("go to analytics"))).go, "analytics");
});

test("what you say is stored redacted; consent still reads the words", async () => {
  const { sim, agent, tick } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  const i = last(agent);
  const text = "note: called the vendor on +91 98765 43210, ticket from ops@example.com, token is ghp_abcdefghijklmnopqrstuvwxyz123456";
  const r = await agent.talk(i.id, text, WISPR(text));
  assert.match(r.reply, /3 private details redacted/);
  const saved = JSON.stringify(agent.state);
  assert.ok(!/98765|ops@example|ghp_/.test(saved), "nothing private stored");
  assert.ok(i.notes[0].text.includes("[number]") && i.notes[0].text.includes("[email]") && i.notes[0].text.includes("[secret]"));
});

test("a approval record reads on its own, and the postmortem keeps what you said, in your own words", async () => {
  const { sim, agent, tick } = setup();
  await tick(3); sim.faults.config.run(); await tick(2);
  const i = last(agent);
  await agent.talk(i.id, "What happened?", WISPR("What happened?"));
  await agent.talk(i.id, "Approve fix one.", WISPR("Approve fix one."));
  await tick(4);
  const c = agent.certificate(agent.state.receipts[0].id);
  assert.match(c, /# Approval record rcpt-1-1/);
  assert.match(c, /\*\*Words:\*\* “Approve fix one\.”/);
  assert.match(c, /16 characters in one insertion, 0 keystrokes/);
  assert.match(c, /Change behind it:.*deploy-bot/);
  assert.match(c, /not a signature/);
  const pm = agent.postmortem(i);
  assert.match(pm, /## In your own words/);
  assert.match(pm, /“What happened\?” \(Wispr Flow\)/);
});

test("describe a service out loud and get the add command", () => {
  const d = W.describeService("Watch my shop api, it runs in docker container shop-api, health check at localhost 3000 slash healthz, config in config slash api dot json, git repo here");
  assert.strictEqual(d.id, "shop-api");
  assert.deepStrictEqual(d.flags, { health: "http://localhost:3000/healthz", docker: "shop-api", watch: "./config/api.json", git: "." });
  assert.strictEqual(d.cli, "wisprops add shop-api --health http://localhost:3000/healthz --docker shop-api --watch ./config/api.json --git .");
  const k = W.describeService("add payments on kubernetes deployment payments namespace prod, health https://pay.example.com/healthz");
  assert.strictEqual(k.flags.kubernetes, "payments");
  assert.strictEqual(k.flags.namespace, "prod");
  const bad = W.describeService("watch the thing");
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.warnings.length === 2);
  assert.strictEqual(W.parseRule("db pool should be 20"), null, "too loose to enforce");
  assert.deepStrictEqual(W.parseRule("rate limit rps should never be zero"), { key: "rate limit rps", words: ["rate", "limit", "rps"], op: "!=", value: 0, text: "rate limit rps never 0" });
  // numbers as people say them, and negations that flip the bound
  const R = (t) => { const r = W.parseRule(t); return r && [r.op, r.value]; };
  assert.deepStrictEqual(R("pool size must be at least 1,000"), [">=", 1000]);
  assert.deepStrictEqual(R("limit must be at most five hundred"), ["<=", 500]);
  assert.deepStrictEqual(R("db pool must be at least twenty five"), [">=", 25]);
  assert.deepStrictEqual(R("cache must be under 1.5k"), ["<", 1500]);
  assert.deepStrictEqual(R("timeout must not be above 50"), ["<=", 50]);
  assert.deepStrictEqual(R("db pool must not be below 10"), [">=", 10]);
  // the key is found from the end of the phrase, whatever comes before it
  const after = W.parseRule("After the migration db pool must be at least ten");
  const { createAgent } = W; void createAgent;
  assert.strictEqual(after.op, ">=");
  assert.ok(["db pool", "migration db pool"].includes(after.key));
});

test("a nearby unrelated change is listed as evidence but never blamed", async () => {
  const { sim, agent, tick } = setup(null, { whoChanged: async () => null });
  await tick(3);
  await agent.reportChange("checkout-api", { kind: "deploy", text: "deployed docs-only change", by: "sam", source: "CLI" });
  sim.faults.config.run();
  await tick(2);
  const i = last(agent);
  assert.doesNotMatch(i.cause.summary, /Changed by/);
  assert.match(i.evidence.find((e) => e.kind === "changes").text, /docs-only change by sam/);
  await agent.reportChange("checkout-api", { kind: "config", key: "db_pool", text: "config sync", by: "deploy-bot" });
});

test("review fixes: negations in Devanagari, conditions after a grant, trusted-only rules, rules vs restarts", async () => {
  // a "don't" in Devanagari, or a condition after the grant, is never consent
  for (const t of ["ग्रांट स्टैंडिंग ऑर्डर मत दो", "रिन्यू स्टैंडिंग ऑर्डर नहीं", "grant standing order after I check the logs", "grant standing order unless it is a rollback", "renew standing order for seven days except at night", "renew standing order sooner"])
    assert.strictEqual(W.parseIntent(t).kind, "unclear", t);
  assert.deepStrictEqual(W.parseIntent("renew standing order 2 for seven days"), { kind: "renew", id: "so-2", days: 7, uses: 3 });

  // a note from MCP or an unsigned client stays text; it can't become an enforced rule
  const { sim, agent, tick } = setup();
  const n = agent.addRunbook("checkout-api", "db_pool should never be 20", "MCP: meeting summary", { rules: false });
  assert.ok(n && !n.rule);

  // a broken rule holds back only its key: a new healthy release is still recorded
  agent.addRunbook("checkout-api", "db_pool must be at least 10", "typed");
  await tick(3);
  sim.svcs["checkout-api"].config.db_pool = 5;
  sim.svcs["checkout-api"].version = "v41b";
  W.reduceLogs([]); // no-op, keeps the helper imported
  require("../src/sim.js").RELEASES.v41b = { ok: true };
  await tick(3);
  const g = agent.rt("checkout-api").golden;
  assert.strictEqual(g.config.db_pool, 20);
  assert.strictEqual(g.version, "v41b");

  // a dead process is a restart, even while a rule is broken (no drift: the snapshot already had the bad value)
  const h = setup();
  h.sim.svcs["checkout-api"].config.db_pool = 5;
  await h.tick(3);
  h.agent.addRunbook("checkout-api", "db_pool must be at least 10", "typed");
  h.sim.svcs["checkout-api"].up = false;
  await h.tick(2);
  const i = last(h.agent);
  assert.strictEqual(i.cause.kind, "process_down");
  assert.strictEqual(i.proposals[0].action.kind, "restart");
});

test("a short Wispr phrase counts when all of it arrived at once; the refusal says why", async () => {
  const { agent } = setup();
  await agent.command("freeze production", TYPED("freeze production"));
  let r = await agent.command("Unfreeze.", { via: "wispr", insert: 9, keys: 0 });
  assert.match(r.reply, /Unfrozen/);
  await agent.command("freeze production", TYPED("freeze production"));
  r = await agent.command("unfreeze production", { via: "wispr", insert: 8, keys: 0 });
  assert.match(r.reply, /Only part of that arrived/);
});
