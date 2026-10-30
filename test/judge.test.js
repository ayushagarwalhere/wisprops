// The terminal night ("wisprops judge") is the whole story end to end; every safety check in it must hold.
const test = require("node:test");
const assert = require("node:assert");
const { judge } = require("../bin/judge.js");

test("wisprops judge: a whole night, every check holds", async () => {
  const lines = [];
  const r = await judge({ out: (s) => lines.push(s), color: false });
  assert.ok(r.ok, r.checks.filter((c) => !c.ok).map((c) => c.what).join("; "));
  assert.ok(r.checks.length >= 12);
  assert.ok(lines.some((l) => /Refused\. That arrived as 13 keystrokes/.test(l)));
});
