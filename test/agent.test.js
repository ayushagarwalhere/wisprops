const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const { createAgent, parseIntent, consent } = require("../src/agent.js");
const { createSim } = require("../src/sim.js");

function setup(settings) {
  let t = Date.parse("2026-10-29T23:00:00Z");
  const now = () => t;
  const sim = createSim({ now, settings: Object.assign({ sayItBack: false }, settings) });
  const pages = [];
  const adapters = Object.assign({}, sim.adapters, {
    notify: async (m) => pages.push(m),
    digest: async (s) => crypto.createHash("sha256").update(s).digest("hex"),
  });
  const agent = createAgent({ config: sim.config, adapters });
  const tick = async (n = 1) => { for (let k = 0; k < n; k++) { t += 5000; await agent.tick(); } };
  const advance = (ms) => { t += ms; };
  return { sim, agent, tick, pages, advance };
}
const WISPR = (text) => ({ via: "wispr", insert: text.length, keys: 0 });
const TYPED = (text) => ({ via: "typed", insert: 1, keys: text.length });

test("parses spoken intents, including number words and refusals", () => {
  assert.deepStrictEqual(parseIntent("Approve fix one."), { kind: "approve", n: 1 });
  assert.deepStrictEqual(parseIntent("approve fix 2"), { kind: "approve", n: 2 });
  assert.strictEqual(parseIntent("Yes, do it.").kind, "vague");
  assert.strictEqual(parseIntent("haan kar do").kind, "vague");
  assert.deepStrictEqual(parseIntent("Grant standing order for seven days."), { kind: "grant", days: 7, uses: 3 });
  assert.strictEqual(parseIntent("Undo fix one").kind, "undo");
  assert.strictEqual(parseIntent("open the pull request").kind, "pr");
});

test("consent needs a Wispr burst, not keystrokes", () => {
  assert.strictEqual(consent({ via: "wispr", insert: 16, keys: 0 }, 11).ok, true);
  assert.strictEqual(consent({ via: "typed", insert: 1, keys: 13 }, 11).ok, false);
  assert.strictEqual(consent({ via: "typed", insert: 1, keys: 13 }, 11, { allowTyped: true }).flagged, true);
});

test("a full night: config drift, refusals, Wispr approval, verified recovery, standing order, quiet repeat", async () => {
  const { sim, agent, tick, pages } = setup({ sayItBack: true });
  await tick(3);
  assert.ok(agent.rt("checkout-api").golden, "golden snapshot taken while healthy");

  sim.faults.config.run();
  await tick(2);
  const inc = agent.state.incidents[0];
  assert.ok(inc, "incident opened");
  assert.strictEqual(inc.cause.kind, "config_drift");
  assert.strictEqual(inc.proposals[0].action.kind, "restore_config");
  assert.strictEqual(inc.proposals[0].action.value, 20);
  assert.strictEqual(pages.filter((p) => p.kind === "page").length, 1, "on-call paged once");

  let r = await agent.talk(inc.id, "Yes, do it.", WISPR("Yes, do it."));
  assert.match(r.reply, /exact words/);
  r = await agent.talk(inc.id, "approve fix 1", TYPED("approve fix 1"));
  assert.match(r.reply, /Refused/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0, "typed approval changed nothing");

  r = await agent.talk(inc.id, "Approve fix one.", WISPR("Approve fix one."));
  assert.match(r.reply, /Say it back/, "the bare phrase is not enough");
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0);
  r = await agent.talk(inc.id, "Approve fix one, db pool back to 10.", WISPR("Approve fix one, db pool back to 10."));
  assert.match(r.reply, /Refused: you said 10, but fix 1 sets db_pool to 20/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0, "a wrong say-back changed nothing");
  r = await agent.talk(inc.id, "Approve fix one, DB pool back to twenty on checkout API.", WISPR("Approve fix one, DB pool back to twenty on checkout API."));
  assert.match(r.reply, /Applying fix 1/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 20);
  await tick(3);
  assert.strictEqual(inc.status, "resolved");
  const receipt = agent.state.receipts[0];
  assert.strictEqual(receipt.channel, "Wispr Flow");
  assert.deepStrictEqual(receipt.saidBack.map((f) => f.label), ["db_pool", "20", "checkout-api"]);
  assert.match(agent.certificate(receipt.id), /\*\*Said back:\*\* db_pool ✓ · 20 ✓ · checkout-api ✓/);
  assert.strictEqual(receipt.outcome, "recovered");
  assert.match(receipt.digest, /^[0-9a-f]{64}$/);

  r = await agent.talk(inc.id, "Grant standing order for seven days.", WISPR("Grant standing order for seven days."));
  assert.match(r.reply, /Granted so-1/);

  await tick(3);
  sim.faults.config.run();
  await tick(2);
  const inc2 = agent.state.incidents[1];
  assert.strictEqual(inc2.orderId, "so-1");
  assert.strictEqual(inc2.woken, false);
  assert.strictEqual(pages.filter((p) => p.kind === "page").length, 1, "nobody paged the second time");
  assert.strictEqual(pages.filter((p) => p.kind === "resolved").length, 1, "one all-clear after the paged fix, none for the quiet one");
  await tick(3);
  assert.strictEqual(inc2.status, "resolved");
  assert.match(agent.handoff(0), /woken 1 time, 1 handled under a standing order/);
  assert.match(agent.postmortem(inc), /## Consent/);
});

test("bad deploy is rolled back; undo rolls forward", async () => {
  const { sim, agent, tick } = setup();
  await tick(3);
  sim.faults.deploy.run();
  await tick(2);
  const inc = agent.state.incidents[0];
  assert.strictEqual(inc.cause.kind, "bad_deploy");
  await agent.talk(inc.id, "approve fix one", WISPR("approve fix one"));
  assert.strictEqual(sim.svcs["checkout-api"].version, "v41");
  await tick(3);
  assert.strictEqual(inc.status, "resolved");
  await agent.talk(inc.id, "undo fix one", WISPR("undo fix one"));
  assert.strictEqual(sim.svcs["checkout-api"].version, "v42");
  assert.strictEqual(inc.status, "handed back");
});

test("speaking over the read-back withdraws the fix and kills its phrase", async () => {
  const { sim, agent, tick } = setup();
  await tick(3);
  sim.faults.crash.run();
  await tick(2);
  const inc = agent.state.incidents[0];
  assert.strictEqual(inc.cause.kind, "process_down");
  await agent.talk(inc.id, "wait, is the database ok?", Object.assign(WISPR("wait, is the database ok?"), { duringReadback: true }));
  assert.strictEqual(inc.proposals[0].state, "withdrawn");
  assert.strictEqual(inc.proposals[1].n, 2);
  const r = await agent.talk(inc.id, "approve fix one", WISPR("approve fix one"));
  assert.match(r.reply, /withdrawn/);
  await agent.talk(inc.id, "approve fix two", WISPR("approve fix two"));
  await tick(4);
  assert.strictEqual(inc.status, "resolved");
});

test("a fix that does not recover escalates honestly", async () => {
  const { sim, agent, tick, advance } = setup();
  await tick(3);
  sim.faults.deploy.run();
  await tick(2);
  const inc = agent.state.incidents[0];
  // break the executor: rollback "succeeds" but the release stays bad
  sim.adapters.exec = async () => ({ ok: true, output: "pretend success" });
  await agent.talk(inc.id, "approve fix one", WISPR("approve fix one"));
  advance(30000);
  await tick(1);
  assert.strictEqual(inc.status, "escalated");
  assert.strictEqual(agent.state.receipts[0].outcome, "did not recover");
});
