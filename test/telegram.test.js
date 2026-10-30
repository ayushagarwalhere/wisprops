"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAgent } = require("../src/agent.js");
const { createSim } = require("../src/sim.js");
const { createTelegram } = require("../server/telegram.js");

const TOKEN = "123456:SECRET-token_abc";
const CHAT = 4242;

// A fake Bot API: records every request, serves queued updates to getUpdates,
// and holds an empty poll open until an update arrives or the poll is aborted.
function fakeBot() {
  const calls = [];
  const queue = [];
  let waiting = null, nextUpdate = 1, nextMsg = 100;
  const ok = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
  async function fetchImpl(url, init) {
    const method = url.split("/").pop();
    const body = JSON.parse(init.body);
    calls.push({ url, method, body });
    if (method === "getUpdates") {
      if (!queue.length) {
        await new Promise((resolve, reject) => {
          waiting = resolve;
          init.signal.addEventListener("abort", () => { waiting = null; const e = new Error("aborted"); e.name = "AbortError"; reject(e); }, { once: true });
        });
      }
      return ok(queue.splice(0));
    }
    if (method === "sendMessage") return ok({ message_id: ++nextMsg, chat: { id: body.chat_id }, text: body.text });
    return ok(true);
  }
  function push(update) {
    queue.push(Object.assign({ update_id: nextUpdate++ }, update));
    if (waiting) { const w = waiting; waiting = null; w(); }
  }
  const sent = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.body);
  return { calls, fetchImpl, push, sent };
}

async function waitFor(pred, ms = 2000) {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const quietLog = () => { const lines = []; const f = (...a) => lines.push(a.join(" ")); return { lines, log: f, warn: f, error: f, info: f }; };

async function setup(publicUrl) {
  let t = Date.parse("2026-10-29T23:00:00Z");
  const sim = createSim({ now: () => t });
  const agent = createAgent({ config: sim.config, adapters: sim.adapters });
  const tick = async (n) => { for (let k = 0; k < n; k++) { t += 5000; await agent.tick(); } };
  await tick(3);
  sim.faults.config.run();
  for (let k = 0; k < 10 && !(agent.state.incidents[0] && agent.state.incidents[0].status === "proposed"); k++) await tick(1);
  const inc = agent.state.incidents[0];
  assert.equal(inc.status, "proposed");
  const bot = fakeBot();
  const out = quietLog();
  const tg = createTelegram({ token: TOKEN, chat: CHAT, agent, publicUrl, fetchImpl: bot.fetchImpl, log: out, backoffMs: 10 });
  return { sim, agent, inc, bot, tg, out };
}

const msg = (text, extra) => ({ message: Object.assign({ message_id: 1, chat: { id: CHAT }, text }, extra || {}) });

test("a page has the buttons; no URL button for localhost, one for https", async () => {
  const a = await setup("http://localhost:7300");
  await a.tg.notify({ kind: "page", title: "checkout-api is down", body: "db_pool was set to 0", incidentId: a.inc.id, phrase: "approve fix one" });
  const m = a.bot.sent()[0];
  assert.equal(String(m.chat_id), String(CHAT));
  const kb = m.reply_markup.inline_keyboard.flat();
  assert.deepEqual(kb.map((b) => b.callback_data).filter(Boolean), ["explain:" + a.inc.id, "ack:" + a.inc.id]);
  assert.ok(!kb.some((b) => b.url), "no URL button for http://localhost");
  assert.match(m.text, /Wispr Flow/);
  assert.match(m.text, /“approve fix one”/);

  const b = await setup("https://ops.example.com");
  await b.tg.notify({ kind: "escalate", title: "Nobody answered", body: "checkout-api", incidentId: b.inc.id });
  const url = b.bot.sent()[0].reply_markup.inline_keyboard.flat().find((x) => x.url);
  assert.equal(url.url, "https://ops.example.com/#/board?inc=" + encodeURIComponent(b.inc.id));

  await b.tg.notify({ kind: "resolved", title: "Recovered", body: "ok", incidentId: b.inc.id });
  assert.equal(b.bot.sent()[1].reply_markup, undefined, "no buttons on an all-clear");
});

test("“approve fix one” in a reply is refused before the agent sees it", async () => {
  const { agent, inc, bot, tg } = await setup("https://ops.example.com");
  let calls = 0;
  const real = agent.command;
  agent.command = (...args) => { calls++; return real(...args); };
  const page = await tg.notify({ kind: "page", title: "down", body: "x", incidentId: inc.id, phrase: "approve fix one" });
  tg.start();
  bot.push(msg("approve fix one", { reply_to_message: { message_id: page.message_id } }));
  await waitFor(() => bot.sent().length >= 2);
  await tg.stop();
  const reply = bot.sent()[1].text;
  assert.match(reply, /A Telegram message can't change production/);
  assert.match(reply, /“approve fix one”/);
  assert.ok(reply.includes("https://ops.example.com/#/board?inc=" + encodeURIComponent(inc.id)));
  assert.equal(calls, 0, "agent.command never called");
  assert.equal(inc.status, "proposed");
  assert.equal(agent.state.receipts.length, 0);
});

test("“I'm on it” acknowledges; /status and /orders reply; offset advances", async () => {
  const { inc, bot, tg, agent } = await setup("http://localhost:7300");
  const page = await tg.notify({ kind: "page", title: "down", body: "x", incidentId: inc.id });
  tg.start();
  bot.push(msg("I'm on it", { reply_to_message: { message_id: page.message_id } }));
  await waitFor(() => bot.sent().length >= 2);
  assert.ok(inc.ackAt, "ackAt set");
  assert.equal(inc.ackVia, "telegram");
  assert.equal(inc.status, "proposed");

  bot.push(msg("/status"));
  await waitFor(() => bot.sent().length >= 3);
  assert.equal(bot.sent()[2].text, agent.statusLine());

  bot.push(msg("/orders@WisprOpsBot"));
  await waitFor(() => bot.sent().length >= 4);
  assert.equal(bot.sent()[3].text, "No active standing orders.");

  const polls = bot.calls.filter((c) => c.method === "getUpdates").map((c) => c.body.offset);
  assert.deepEqual(polls.slice(0, 4), [0, 2, 3, 4]);
  await tg.stop();
});

test("callback buttons: ack and explain, always answered", async () => {
  const { inc, bot, tg } = await setup("http://localhost:7300");
  tg.start();
  bot.push({ callback_query: { id: "cq1", data: "ack:" + inc.id, message: { message_id: 9, chat: { id: CHAT } } } });
  await waitFor(() => bot.sent().length >= 1);
  assert.equal(bot.sent()[0].text, "Acknowledged. Your backup will not be paged.");
  assert.ok(inc.ackAt);
  assert.equal(inc.ackVia, "Telegram");

  bot.push({ callback_query: { id: "cq2", data: "explain:" + inc.id, message: { message_id: 9, chat: { id: CHAT } } } });
  await waitFor(() => bot.sent().length >= 2);
  assert.ok(bot.sent()[1].text.length > 0);
  await tg.stop();
  const answered = bot.calls.filter((c) => c.method === "answerCallbackQuery").map((c) => c.body.callback_query_id);
  assert.deepEqual(answered, ["cq1", "cq2"]);
  assert.equal(inc.status, "proposed");
});

test("other chats are ignored and logged once; voice notes get the Wispr keyboard hint", async () => {
  const { inc, bot, tg, out } = await setup("http://localhost:7300");
  tg.start();
  bot.push({ message: { message_id: 1, chat: { id: 999 }, text: "I'm on it" } });
  bot.push({ message: { message_id: 2, chat: { id: 999 }, text: "/status" } });
  bot.push({ callback_query: { id: "x", data: "ack:" + inc.id, message: { message_id: 3, chat: { id: 999 } } } });
  bot.push({ message: { message_id: 4, chat: { id: CHAT }, voice: { file_id: "v", duration: 3 } } });
  await waitFor(() => bot.sent().length >= 1);
  await tg.stop();
  assert.equal(bot.sent().length, 1, "only the voice note was answered");
  assert.match(bot.sent()[0].text, /doesn't transcribe audio/);
  assert.match(bot.sent()[0].text, /Wispr Flow's keyboard/);
  assert.ok(!inc.ackAt, "foreign chat did not acknowledge");
  assert.ok(!bot.calls.some((c) => c.method === "answerCallbackQuery"));
  assert.equal(out.lines.filter((l) => /chat 999/.test(l)).length, 1);
});

test("errors back off and never log the token; stop() ends the loop", async () => {
  const out = quietLog();
  let polls = 0;
  const fetchImpl = async (url, init) => {
    polls++;
    if (polls < 3) throw new Error("connect ECONNREFUSED for " + url);
    if (polls < 5) return { ok: false, status: 502, url, json: async () => ({ ok: false, description: "Bad Gateway" }) };
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  };
  const agent = { statusLine: () => "", handoff: () => "", command: async () => ({}), acknowledge: async () => true, state: { orders: [] } };
  const tg = createTelegram({ token: TOKEN, chat: CHAT, agent, fetchImpl, log: out, backoffMs: 5 });
  tg.start();
  await waitFor(() => polls >= 5);
  await tg.stop();
  const after = polls;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(polls, after, "no polling after stop()");
  assert.ok(out.lines.length >= 4);
  assert.ok(!out.lines.some((l) => l.includes(TOKEN) || l.includes("SECRET")), "token never logged");
});
