# Submission kit: No Hands, The Wispr Challenge

**Deadline:** Friday 30 October 2026, 11:59 pm IST. One page says 31 October; don't rely on it.

**Scoring:** problem from your own work 30% · how you used Wispr 30% · it works 25% · demo clarity 15%.

## Checklist

- [ ] **Public repo:** push this folder to `github.com/ayushagarwalhere/wisprops` (the link used in the console, README, website and video).
- [ ] **A link judges can try with no login and no payment:** the website at https://54-252-252-150.sslip.io (scroll story → **▶ Play the demo** opens the console sandbox, no sign-in). To host it on GitHub Pages instead, build `site/` (`cd site && npm ci && npm run build`) and publish `site/dist`; it already contains the demo console.
- [ ] **Demo video, up to two minutes** (the rules say "a demo video of up to two minutes"): `video/out/wisprops-video-2min.mp4` (1:58). Submit this one.
  A longer walkthrough, `video/out/wisprops-video-3min.mp4` (3:15), shows more of the console and the full setup; use it for YouTube or social posts, or link it from the write-up as an extra.
  Rebuild (from `video/`): `node build-audio.js script2.json build2`, `node sync-ins.js script2.json build2`, `node build-audio.js script2.json build2`, then `node render.js --cut 2` (long cut: `script3.json build3`, `--cut 3`).
- [ ] **Wispr usage card:** a screenshot from the Wispr Flow desktop app → Insights → Your usage
- [ ] **Leaderboard proof:** screenshot of https://www.wemakedevs.org/wispr/leaderboard showing **#3, Ayush Agarwal (@ayushagarwalhere), 9,06,552 words** (checked 30 Oct 2026; re-check before submitting, it moves)
- [x] **Re-cut the demo video:** both cuts now show the say-back ("…back to ten" refused, "…back to twenty" applied), the debrief becoming the postmortem, and `wisprops judge` with 16 checks
- [ ] **Short clip of Flow in use:** with No hands on, hold the Wispr key and say "approve fix one, db pool back to ten" (refused: "you said 10, but fix 1 sets db_pool to 20"), then "approve fix one, db pool back to twenty" (applied). Then hold it for 30 seconds for a "debrief: …" and show the postmortem it produced
- [ ] **A few lines** (draft below)

## A few lines (rewrite in your own voice, with Wispr)

> **Problem:** my side projects and hackathon deploys break at night, and the fix is usually small: a config value someone changed, a bad release, a dead process. But it means waking up, opening a laptop and typing commands half-asleep, which is exactly when a wrong "yes" does damage.
>
> **What I built:** WisprOps, an on-call agent for your own services (Docker, pm2, systemd, Kubernetes, or anything with a health check). It finds the cause and who caused it (a change ledger fed by CI, git authors and its own snapshots), keeps only the log lines that matter, and remembers when the same thing broke last week. It proposes one fix from a short allowlist with a dry run, and applies it only when I say the fix back with Wispr Flow: "approve fix one, db_pool back to 20". Then it proves the recovery. If I allow it out loud, it fixes the same failure next time without waking me. It escalates to a backup, takes Grafana and Alertmanager alerts, pages Telegram, freezes production on command, and sends a morning handoff. Anyone can set it up in about a minute: `wisprops start` in an empty folder, describe your service out loud (HTTP, a Postgres or Redis port, or a check command), pick a private ntfy topic, and send a test page. `wisprops service` keeps it running after reboot, or run it in Docker.
>
> **How I used Wispr:** Wispr Flow is the authorization, and I use it for what it's good at: talking, not tapping. At 3 AM a button can't tell whether I understood what I approved, so I approve by saying the fix back in one Wispr dictation: "approve fix one, db_pool back to 20". WisprOps checks every fact I say against the fix. Say 10 instead of 20, name the wrong service, or add "and restart it", and nothing runs. Typed approvals are refused, and every change gets an approval record with my words and what I said back. In the morning I hold the Wispr key and talk through what happened for a minute. That one dictation becomes the postmortem: why it happened, action items with owners and dates ("Sam will … by Friday"), what went well, and "db_pool must stay at 10 or more" becomes a rule WisprOps enforces. "No hands" mode makes the whole console voice-driven: the page is read aloud, dictations send themselves, and "open the audit log" or "what changed?" moves you around. Setup is spoken too: describe a service and it's added, and dictate "db_pool must stay at 20 or more" and it becomes a rule WisprOps enforces. Hinglish and Devanagari work. On my phone, Flow's keyboard answers Telegram pages, but never approvals. I dictated my prompts, docs and this text with Wispr Flow: I'm #3 on the No Hands leaderboard with 9,06,552 words (usage card and leaderboard screenshot attached).

## Two-minute demo script

Run `node bin/wisprops.js demo`, open the sign-in link it prints, and break things with `node bin/wisprops.js break config`, so the video shows real fixes on a real service. Turn on **🙌 No hands** in the Talk panel first.

| Time | Show | Say |
|---|---|---|
| 0:00–0:10 | Console, red page banner, the page is read aloud; phone shows the ntfy or Telegram page | "It's 3 AM and checkout is down. I'm not opening a terminal." |
| 0:10–0:25 | Hold Wispr: **"What happened?"** → evidence: changed by deploy-bot, the one log line that matters | "It found the change, who made it, and the only log line that matters." |
| 0:25–0:35 | Type "approve fix 1" on the keyboard → refused | "Typed approvals are refused. It has to be my voice." |
| 0:35–0:50 | Hold Wispr: **"Approve fix one, DB pool back to ten."** → refused: "you said 10, but fix 1 sets db_pool to 20". Then **"Approve fix one, DB pool back to twenty."** → applied, verifying, recovered | "I have to say what I'm approving. Get one fact wrong and nothing runs. Get it right and it waits for three healthy checks." |
| 0:50–1:05 | **"Grant standing order for seven days, only at night."**, break it again → fixed, "nobody woken", "I've seen this before" | "Same failure tomorrow night: fixed while I sleep, under an order I granted out loud." |
| 1:05–1:20 | **"Open the audit log."** → Approval record | "Every change, with the exact words, how they arrived, and a digest." |
| 1:20–1:35 | **"Freeze production."** → banner; typing "unfreeze production" is refused | "Anyone can freeze. Only my voice can unfreeze." |
| 1:35–1:50 | Morning: hold Wispr for 30 s: **"Debrief: deploy-bot ran the staging profile… Sam will make the deploy job refuse a zero pool by Friday… db_pool must stay at 10 or more."** → postmortem opens with causes, action items, the new rule | "In the morning I just talk. One dictation becomes the postmortem, the action items and a new rule." |
| 1:50–2:00 | Terminal: `node bin/wisprops.js judge` → "All 16 checks held"; Wispr usage card + leaderboard (#3, 9,06,552 words) | "Built hands-free: 9 lakh words dictated with Wispr Flow." |
