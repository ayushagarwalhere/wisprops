// Say-it-back approvals and dictated debriefs: the two places WisprOps uses long dictation.
const test = require("node:test");
const assert = require("node:assert");
const W = require("../src/agent.js");
const { createSim } = require("../src/sim.js");

function setup(settings) {
  let t = Date.parse("2026-10-29T23:00:00Z");
  const sim = createSim({ now: () => t, settings });
  const agent = W.createAgent({ config: sim.config, adapters: Object.assign({}, sim.adapters, { notify: async () => {} }) });
  const tick = async (n = 1) => { for (let k = 0; k < n; k++) { t += 5000; await agent.tick(); } };
  return { sim, agent, tick };
}
const WISPR = (text) => ({ via: "wispr", insert: text.length, keys: 0 });
async function broken(fault, settings) {
  const s = setup(settings);
  await s.tick(3); s.sim.faults[fault].run(); await s.tick(2);
  s.inc = s.agent.state.incidents[0];
  s.say = (text, meta) => s.agent.talk(s.inc.id, text, meta || WISPR(text));
  return s;
}

const svc = { id: "checkout-api", name: "checkout-api", configLabel: "config/checkout.json" }, auth = { id: "auth", name: "auth" };
const check = (said, p, s) => { const i = W.parseIntent(said); return W.checkSayBack(p, s || svc, [svc, auth], i.back, i.rawBack); };
const restore = { n: 1, action: { kind: "restore_config", key: "db_pool", value: 20, from: 0 } };
const rollback = { n: 1, action: { kind: "rollback", from: "v42", to: "v41" } };
const restart = { n: 2, action: { kind: "restart" } };

test("say-back: the facts that define the fix must be said, and right", () => {
  assert.strictEqual(check("Approve fix one, db_pool back to 20.", restore).ok, true);
  assert.strictEqual(check("Approve fix one, DB pool back to twenty on checkout API.", restore).ok, true);
  assert.strictEqual(check("approve fix ek, db_pool wapas 20", restore).ok, true, "Hinglish");
  assert.strictEqual(check("Approve fix one, put the pool back to 20, it is 0 now.", restore).ok, true, "the old value may be mentioned");
  assert.match(check("Approve fix one, db pool back to 10.", restore).problems[0], /you said 10, but fix 1 sets db_pool to 20/);
  assert.match(check("Approve fix one, set it to 20.", restore).problems.join(), /didn't hear db_pool/);
  assert.match(check("Approve fix one, db pool back to 20 on auth.", restore).problems.join(), /you said auth, but fix 1 is for checkout-api/);
  assert.match(check("Approve fix one, db pool back to 20 and restart it.", restore).problems.join(), /“restart”, but fix 1 only changes db_pool/);

  assert.strictEqual(check("Approve fix one, roll checkout back to v41.", rollback).ok, true);
  assert.strictEqual(check("Approve fix one, roll back to forty one.", rollback).ok, true);
  assert.match(check("Approve fix one, roll back to v40.", rollback).problems.join(), /you said 40/);
  assert.strictEqual(check("Approve fix one, roll back to the previous one.", rollback).ok, false, "“the previous one” names no release");

  assert.strictEqual(check("Approve fix two, restart auth.", restart, auth).ok, true);
  assert.strictEqual(check("Approve fix two, restart it.", restart, auth).ok, false, "a restart has to name the service");
  assert.match(check("Approve fix two, restart checkout.", restart, auth).problems.join(), /you said checkout-api, but fix 2 is for auth/);
  assert.strictEqual(W.parseIntent("Approve fix one, db pool to 20, not 10.").kind, "unclear", "a negation is never consent");
});

test("say-back: the bare phrase asks for it, a wrong one changes nothing, the right one applies", async () => {
  const { sim, inc, say } = await broken("config");
  assert.match((await say("Approve fix one.")).reply, /Say it back.*“approve fix one, db_pool back to 20”/);
  assert.match((await say("Approve fix one, db pool back to 10.")).reply, /^Refused: you said 10/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0);
  assert.strictEqual(inc.proposals[0].state, "pending");
  assert.match((await say("Approve fix one, db pool back to 20.")).reply, /Applying fix 1/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 20);
});

test("say-back: the whole sentence has to arrive as one dictation", async () => {
  const { sim, say } = await broken("config");
  const text = "Approve fix one, db pool back to 20.";
  // "approve fix one" dictated, the rest typed: only part of it was one burst
  const r = await say(text, { via: "wispr", insert: 16, keys: 0 });
  assert.match(r.reply, /^Refused\. Only part of that arrived as one Wispr Flow dictation/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0);
});

test("say-back: the proposal, the page and the read-back carry the sentence to say", async () => {
  const { agent, inc } = await broken("deploy");
  const p = inc.proposals[0];
  assert.strictEqual(p.phrase, "approve fix one, roll checkout-api back to v41");
  assert.match(agent.readback(p), /To apply it, say: approve fix one, roll checkout-api back to v41\./);
  assert.match(inc.timeline.find((x) => x.proposal === 1).text, /say it back in one Wispr Flow dictation: “approve fix one, roll checkout-api back to v41”/);
});

test("say-back off: the short phrase works, but anything you add is still checked", async () => {
  const { sim, say } = await broken("config", { sayItBack: false });
  assert.match((await say("Approve fix one, db pool back to 10.")).reply, /^Refused: you said 10/);
  assert.match((await say("Approve fix one.")).reply, /Applying fix 1/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 20);
});

test("debrief: one long dictation becomes causes, owned action items, wins and rules", () => {
  const d = W.parseDebrief("So deploy-bot ran the staging profile against production, which set db_pool to zero. Sam will make the deploy job refuse a zero pool by Friday. We should alert on pool exhaustion before the health check fails. The standing order worked, nobody was woken the second time. db_pool must stay at 10 or more. Also I'll write the runbook entry tomorrow. The pager took four minutes.");
  assert.deepStrictEqual(d.actions, [
    { owner: "Sam", text: "make the deploy job refuse a zero pool", due: "by Friday" },
    { owner: "team", text: "alert on pool exhaustion before the health check fails", due: null },
    { owner: "me", text: "write the runbook entry", due: "tomorrow" },
  ]);
  assert.deepStrictEqual(d.causes, ["deploy-bot ran the staging profile against production, which set db_pool to zero"]);
  assert.strictEqual(d.good.length, 1);
  assert.strictEqual(d.rules[0].rule.text, "db_pool at least 10");
  assert.deepStrictEqual(d.context, ["The pager took four minutes"]);
  assert.strictEqual(d.words, 65);
});

test("debrief: filed on the incident and its postmortem; only a dictation adds rules; words inside never approve", async () => {
  const { agent, sim, inc, say } = await broken("config");
  const text = "Debrief: approve fix one, db pool back to 20. Riya will add a pre-deploy check. db_pool must stay at 10 or more.";
  let r = await say(text, { via: "typed", insert: 1, keys: text.length });
  assert.match(r.reply, /^Debrief filed on #1: \d+ words → 1 action item \(Riya\)/);
  assert.match(r.reply, /kept as text only/);
  assert.strictEqual(sim.svcs["checkout-api"].config.db_pool, 0, "an approval inside a debrief is not an approval");
  assert.ok(!(agent.state.runbooks["checkout-api"] || []).some((n) => n.rule), "a typed debrief adds no rule");

  r = await say("Debrief: db_pool must stay at 10 or more. Sam will add a CI check by Friday.");
  assert.match(r.reply, /in one Wispr dictation.*1 new rule \(db_pool at least 10\)/);
  assert.strictEqual(r.postmortem, inc.id);
  assert.ok(agent.state.runbooks["checkout-api"].some((n) => n.rule && n.rule.text === "db_pool at least 10"));
  const pm = agent.postmortem(inc);
  assert.match(pm, /## Debrief \(dictated with Wispr Flow, \d+ words in one dictation/);
  assert.match(pm, /- \[ \] \*\*Sam\*\*: add a CI check \(by Friday\)/);
  assert.match(agent.handoff(0), /Action items from debriefs: Riya: add a pre-deploy check · Sam: add a CI check \(by Friday\)/);
});

test("debrief with nothing selected goes to the latest incident; with no incidents it saves nothing", async () => {
  const fresh = setup();
  assert.match((await fresh.agent.command("Debrief: nothing happened.", WISPR("x".repeat(26)))).reply, /no incident to debrief/);
  const { agent, inc } = await broken("config");
  const r = await agent.command("Debrief: Sam will rotate the deploy token.", WISPR("Debrief: Sam will rotate the deploy token."));
  assert.match(r.reply, /Debrief filed on #1/);
  assert.strictEqual(inc.debriefs.length, 1);
});
