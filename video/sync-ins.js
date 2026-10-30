// Set app.in for dictated lines so the text lands in the console just after the words are spoken.
// node sync-ins.js script2.json build2  (then rerun build-audio.js)
const fs = require("fs");
const [sp, bd] = process.argv.slice(2);
const LAND = { s2b: ["03-what-happened", 2.5], s4: ["05-approved", 3.0], s4c: ["05-approved", 12.5], s6: ["06-standing-order", 8.6], h3: ["14-first-run", 13.1] };
const S = JSON.parse(fs.readFileSync(sp, "utf8")), T = JSON.parse(fs.readFileSync(bd + "/timeline.json", "utf8"));
for (const l of S.lines) {
  const k = LAND[l.id]; if (!k || !l.app) continue;
  const t = T.lines.find((x) => x.id === l.id);
  const spoken = t.end - (t.start - 0.15); // from the cut to the end of the words
  l.app.in = +Math.max(0, k[1] - spoken - 0.1).toFixed(2);
  console.log(l.id, "in", l.app.in);
}
fs.writeFileSync(sp, JSON.stringify(S, null, 2));
