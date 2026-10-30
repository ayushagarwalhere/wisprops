# WisprOps

**Sleep. I'm on call.**

WisprOps is an on-call agent for the services you run yourself. When production breaks at night, it does the first hour of the incident for you, and asks you for one sentence: the fix, said back.

| | What happens | Who does it |
|---|---|---|
| **03:12** | `checkout-api` starts returning 502s. WisprOps sees the failed health checks. | WisprOps |
| **03:12** | **It finds the cause.** It reads the logs, the health checks and a ledger of every change from the last hour, and finds one it can prove: `db_pool` went from 20 to 0, set by `deploy-bot` at 03:04. | WisprOps |
| **03:13** | **It proposes one fix**, from three safe actions (restart, roll back a config value, revert a deploy), dry-runs it, and pages you with one sentence. | WisprOps |
| **03:14** | **You say the fix back:** “approve fix one, db_pool back to 20”, out loud, in one [Wispr Flow](https://wisprflow.ai) dictation. Every fact you say is checked against the fix: say 10 instead of 20, the wrong service, or “and restart it”, and nothing happens. A typed yes is refused. A button can't prove you were awake enough to know what you approved. Saying it back can. | you, by voice |
| **03:15** | **It proves the fix held:** three healthy checks in a row. If the service doesn't recover, it wakes you with what it saw, and "undo fix one" reverses the fix. Then it writes the postmortem. | WisprOps |
| **Next night** | **The same fault is fixed without waking you**, because you granted a standing order for it. | WisprOps |
| **Morning** | **You talk it through for a minute:** “debrief: deploy-bot ran the staging profile… Sam will make the deploy job refuse a zero pool by Friday… db_pool must stay at 10 or more.” One dictation becomes the postmortem: why it happened, action items with owners and dates, and a rule WisprOps enforces from then on. | you, by voice |

It runs on your machine: no cloud account, no API key, no dependencies (Node 18.17+). It watches anything with an HTTP health check, an open TCP port or a check command, in Docker, Compose, pm2, systemd, Kubernetes or a plain process.

**Where Wispr Flow fits.** The agent works on its own; Wispr Flow is how you answer it. You approve by saying the fix back in one Wispr Flow dictation, and your exact words and the facts you said back are kept on the approval record. In the morning, a minute of talk becomes the postmortem. The same voice can run the rest of the night hands-free: "what changed?", "I'm on it", "freeze production". Without Wispr, everything except approving works, and `settings.allowTyped` allows typed approvals, flagged on every record.

> ### See it in two minutes
>
> 1. **No install:** open the WisprOps website, scroll through one night, and press **▶ Play the demo**. It opens the console's demo sandbox and plays *The 3 AM config change*. You'll see "yes, do it" refused, the typed phrase refused, a say-back with the wrong value refused, the right one applied and verified, the repeat fixed while nobody is woken, and a dictated debrief turned into the postmortem.
> 2. **With Wispr Flow:** on any scenario press **Try it yourself**, click the Talk box, hold your Wispr key and say the fix back: "approve fix one, db_pool back to 20". Then say 10 instead of 20, or type it.
> 3. **No hands:** turn on **🙌 No hands** in the Talk panel and watch *No hands, start to finish*. The page is read aloud, dictations send themselves, and "open the audit log" moves the screen.
> 4. **In a terminal:** `node bin/wisprops.js judge` plays the whole night against the real agent and ends with "All 16 checks held".
> 5. **The proof:** the **Audit** page shows every change with the words that allowed it, what you said back ("db_pool ✓ · 20 ✓ · checkout-api ✓"), how they arrived ("56 characters in one insertion, 0 keystrokes") and an approval record.

Built by Ayush Agarwal for [No Hands: The Wispr Challenge](https://www.wemakedevs.org/wispr) (WeMakeDevs × Wispr Flow). This is an independent project, not a Wispr product.

**Built hands-free, too.** This project's prompts, docs and write-ups were dictated with Wispr Flow. Ayush is **#3 on the [No Hands leaderboard](https://www.wemakedevs.org/wispr/leaderboard) with 9,06,552 words dictated** (as of 30 October 2026).

---

## Try it

**In the browser, nothing to install.** Open the website (the `site/` folder, hosted with the project) and press **▶ Play the demo**, or open the console (`console.html`) and go to **Demo**. A simulated production (`checkout-api`, `auth`) runs in your tab with the real agent. Press **▶ Watch it** on a scenario, or **Try it yourself** and answer the page with Wispr Flow. Scripted lines are labelled "simulated Wispr" everywhere, including the audit log.

**In a terminal, in ten seconds:** `node bin/wisprops.js judge` plays a whole night with the real agent and consent rules: the cause and who caused it, "yes, do it" refused, the typed phrase refused, the bare "approve fix one" sent back for a say-back, a say-back with the wrong value refused, the right one applied and verified, a standing order, the repeat fixed while you sleep, a freeze, a rollback, the approval record, and the morning debrief. Every safety property is checked as it happens, and the command fails if one doesn't hold.

**On a real service on your machine:**

```bash
git clone https://github.com/ayushagarwalhere/wisprops && cd wisprops
node bin/wisprops.js demo            # a breakable demo service + the console at http://localhost:7300
node bin/wisprops.js break config    # in a second terminal (also: deploy, crash)
```

Open the sign-in link it prints (`http://localhost:7300/login?key=…`; like Jupyter, this signs your browser in, and `wisprops open` prints it again). Click the Talk box, hold your Wispr Flow key and say the fix back, as the Talk panel shows: **"approve fix one, db_pool back to 20"**.

The console also has a **Demo** section while it watches your real services. The sandbox runs in the tab and never touches live state; a real page that arrives while you are in it offers to take you back.

## Use it on your services

### Install and first run (one minute)

```bash
npm install -g github:ayushagarwalhere/wisprops     # or: git clone … && cd wisprops (then use node bin/wisprops.js)
mkdir ~/oncall && cd ~/oncall
wisprops start                                   # creates wisprops.config.json and prints the sign-in link
```

Open the link. The console opens on **"Nothing to watch yet"**:

1. **Add a service by voice.** Hold your Wispr Flow key and describe it: *"Watch my shop api. It runs in docker container shop-api, health check at localhost 3000 slash healthz, config in config slash api dot json."* Or a database: *"watch postgres on localhost 5432."* It's added and watched at once.
2. **Settings → pick a private ntfy topic**, subscribe to it in the free ntfy app, Save, **Send a test page**. Your phone rings. (Slack, Discord, PagerDuty and Telegram are there too.)
3. **Keep it running:** `wisprops service --write` writes a systemd user unit (Linux) or a launchd agent (macOS), or prints the Task Scheduler line (Windows). It never needs root.

Or run it in Docker: `docker build -t wisprops . && docker run -d --network host -v "$PWD/wisprops-data:/data" wisprops` (see `docker-compose.example.yml`; `docker logs wisprops` prints the sign-in link).

### From the command line

```bash
node bin/wisprops.js init
node bin/wisprops.js add api    --health http://localhost:3000/healthz --docker api --watch ./config/api.json --git .
node bin/wisprops.js add worker --health http://localhost:9100/healthz --pm2 worker --watch ./.env
node bin/wisprops.js add web    --health https://web.internal/healthz --kubernetes web --namespace prod
node bin/wisprops.js add --say "watch my shop api in docker container shop-api, health check at localhost 3000 slash healthz"
node bin/wisprops.js add db     --health tcp://localhost:5432                       # a port that must accept connections
node bin/wisprops.js add replica --health-cmd "pg_isready -h localhost -p 5433"      # healthy when the command exits 0
node bin/wisprops.js doctor     # probes every URL, reads every file, finds every command (runs none of them)
node bin/wisprops.js start      # prints the console sign-in link (http://localhost:7300/login?key=…)
node bin/wisprops.js test-page  # a harmless page to every channel you set up
node bin/wisprops.js service    # keep it running after reboot
```

`doctor` tells you, per service, what WisprOps can fix and what it will escalate instead. For example: "no restart command: a dead process will be escalated to you".

| Preset | Restart | Release (for rollbacks) | Rollback | Logs |
|---|---|---|---|---|
| `--docker <container>` | `docker restart` | image of the container | set `rollback` yourself | `docker logs` |
| `--compose <service>` | `docker compose restart` | – | set `rollback` yourself | `docker compose logs` |
| `--pm2 <name>` | `pm2 restart` | – | – | `pm2 logs` |
| `--systemd <unit>` | `systemctl restart` | – | – | `journalctl` |
| `--kubernetes <deployment>` | `kubectl rollout restart` | container image | `kubectl set image … {to}` | `kubectl logs` |
| `--git <dir>` | – | current commit | set `rollback` yourself | – |

Anything you write on a service yourself (`restart`, `rollback`, `reload`, `release`, `logs`) wins over the preset. Commands are argument arrays run **without a shell**.

## Approving with Wispr Flow

Wispr Flow types what you say into whichever field has focus. WisprOps is built around that, everywhere a human makes a decision:

| Where | What you say | What Wispr guarantees here |
|---|---|---|
| **Say it back** (Talk box) | "approve fix one, db_pool back to 20", "approve fix one, roll checkout back to v41", "approve fix two, restart auth" | You approve a fix by saying what it does, in **one Wispr Flow dictation**. The key and value, the release, or "restart" and the service must be there, and everything you name is checked: a wrong number ("you said 10, but fix 1 sets db_pool to 20"), another service, or an extra action ("and restart it") is refused, and nothing runs. The approval record lists what you said back. `settings.sayItBack: false` (config file only) accepts the bare "approve fix one". |
| **Debrief** (Talk box, the morning after) | "debrief: deploy-bot ran the staging profile, which set db_pool to zero. Sam will make the deploy job refuse a zero pool by Friday. We should alert on pool exhaustion. The standing order worked. db_pool must stay at 10 or more." | Talk it through for a minute. Sentences with "because / which set / caused" become **why it happened**, "Sam will… by Friday" becomes an **action item with an owner and a date**, "worked / helped" goes under **what went well**, and "must stay at 10 or more" becomes a **rule** WisprOps enforces (only from a Wispr dictation). It lands near the top of the postmortem and the action items go into the morning handoff. Words inside a debrief are never commands. |
| **Talk box** (every page) | "undo fix one", "grant standing order for seven days", "resume standing orders", "open the pull request" | These change production, so they must be the whole sentence and arrive as **one Wispr Flow dictation**. Keystrokes are refused, and so are questions and negations ("don't approve fix one", "what if I approve fix one?"). If two incidents are waiting, you must pick one first. Each approval is stored on a consent receipt. |
| **Talk box** | "I'm on it", "what happened?", "read it back", "I'll handle it", "snooze checkout api for thirty minutes", "pause standing orders", "what happened last night?" | Hands-free at 3 AM. Typing also works for these. |
| **Read-back** | speak over it | Interrupting withdraws the fix; its phrase stops working until it is proposed again. |
| **Handoff notes** | "note: the deploy bot ran the staging profile" | Lands in the incident, the postmortem and the morning handoff, labelled "dictated with Wispr Flow". |
| **Runbook notes** (Services page) | "If checkout fails at night, check the Stripe status page first" | Shown as evidence the next time that service breaks. |
| **Hinglish** | "approve fix ek", "main dekh raha hoon", "kal raat kya hua?", "rehne do" | Flow handles Hinglish, and so does WisprOps. "haan kar do" is still refused, like any vague yes. |
| **Dictionary** (Wispr page) | – | One click copies your service names and config keys for Flow's dictionary, so `db_pool` comes out right when you are half asleep. |
| **No hands mode** (Talk panel) | anything | Pages are read aloud, the cursor waits in the Talk box, a Wispr dictation sends itself after a short pause, and replies are spoken. Typed text never auto-sends. |
| **Voice navigation** | "open the audit log", "show me standing orders", "open incident two", "what changed?" | Move around the console without a mouse. |
| **Freeze** | "freeze production" / "unfreeze production" | Anyone can freeze, by voice, button or CLI. Only a Wispr dictation unfreezes. |
| **Renewals** | "renew standing order so 1 for seven days, only at night" | Needs Wispr. You're warned a day before an order expires, with the exact words. |
| **Rules** (runbook notes) | "db_pool must stay at 20 or more" | A dictated note with a number becomes a rule: the healthy snapshot never takes a value that breaks it, no fix may restore one, and a breach is fixed to the rule's edge. |
| **Setup** (Services page, CLI) | "watch my api in docker container api, health check at localhost 3000 slash healthz" | Adds the service. No JSON. |
| **Devanagari** | "अप्रूव फिक्स वन", "मैं देख रहा हूँ" | With Hindi on, Flow may write English command words in Devanagari, and they're mapped. Hindi numbers aren't mapped for approvals (दो means both "two" and "give"). |
| **Telegram + Flow's phone keyboard** | "I'm on it", "note: …", "freeze production" | Pages arrive with buttons. Replies dictated on your phone can acknowledge, note, snooze or freeze, but never approve: Telegram can't tell typing from dictation. |
| **Command Mode** | "make this two short sentences" | Tidy a dictated note in place before saving (paid Wispr plan or trial). |
| **Wispr Flow's MCP** | – | Claude Code can pull a Notetaker meeting decision or a Scratchpad note from Wispr Flow and file it into a WisprOps incident or runbook. |

The **Wispr** page in the console has a setup check (say "approve fix one, db_pool back to 20" and see whether it would be accepted), the dictionary words, the full phrasebook, and phone setup.

**How the check works, and its limit.** Wispr Flow inserts a whole dictation at once; typing arrives a key at a time. The Talk box counts both and shows it as you send ("Wispr · 16 chars in one burst"), and the approval record keeps it ("16 characters in one insertion, 0 keystrokes"). Pasted text also arrives at once, so the check proves "not typed key by key", not "spoken". The say-back adds what a burst can't: proof that whoever approved knew what the fix does, because they had to state the right key, value and service rather than a stock phrase. There is no Wispr API for a web page to start or read a dictation, so WisprOps claims nothing more. To accept typed approvals anyway, set `settings.allowTyped`; every such receipt is flagged.

## What it can fix (and nothing else)

| Cause it detects | The one fix it proposes | "undo fix N" |
|---|---|---|
| A config key differs from the last healthy snapshot (JSON with nested keys like `db.pool`, or `.env`) | Put that one key back, then run `reload` if set | Set it back again |
| The release changed since the last healthy check | Roll back to the last healthy release | Roll forward |
| A config value breaks a rule you dictated (even if the "healthy" snapshot had it) | Set it to the edge of your rule | Set it back again |
| The process is not answering | Restart that service | None (it says so) |
| 5xx and nothing explains it | A restart, labelled **"a best guess, not a root cause"**. Never covered by a standing order. | None |
| An alert from your monitoring, health check passing, nothing changed | **Nothing.** It pages you with the evidence instead of guessing. | – |

- Every fix is dry-run before it is proposed **and again** right before it runs.
- **Resolved means proven:** N healthy checks in a row *and* the post-condition (the key has the healthy value, the release is the old one). Otherwise it escalates and says so.
- Fixed by hand while it waited? After N healthy checks the incident closes as "recovered on its own" and the pending fix is withdrawn.
- The only value substituted into a command is a release id matching `^(?!-)[\w.\-:/@+]{1,200}$`.

## What changed, and who changed it

Most 3 AM pages start with a change. WisprOps keeps a **change ledger** for each service:

- config changes and releases it finds when something breaks, and the ones it sees while healthy;
- changes your CI or deploy scripts report: `wisprops change "deployed v43" --service api --by sam`, or `POST /api/change` with `alerts.token`;
- releases from git, attributed to the commit's author;
- its own fixes.

When something breaks, the changes since the last healthy check are quoted as evidence. The cause names who made the change, but **only on an exact match** (same key, same release). A deploy that merely happened nearby is listed, never blamed. Say **"what changed?"** to hear the ledger, or open the **Changes** page.

It also brings the few **log lines that matter**. Lines are grouped by shape, and the ones that are errors and new since the service was last healthy are kept, with counts. And it **remembers**: the second time the same thing breaks in a week, it says so and quotes what fixed it last time and the words that approved it.

## Standing orders

After a fix you approved is verified, WisprOps offers: *"say 'grant standing order for seven days'"*. A standing order covers **one service, one failure signature and one exact action** (for a config drift, the same key going back to the same value; for a bad deploy, rolling any release that breaks the service back to the last healthy one), with a use count and an expiry (capped by `settings.maxOrderDays` / `maxOrderUses`). The next time that exact failure happens, WisprOps applies the fix, verifies it and does not page you. If the fix does not hold, it pages you.

Kill switch: say **"pause standing orders"** (or use the button on the Standing orders page). Every failure then pages you until you say "resume standing orders".

- Add **"only at night"** when you grant or renew one, and it acts only between `settings.nightFrom` and `nightTo` (22:00–08:00). During the day it asks you.
- A day before an order expires, you're told, with the words to keep it: **"renew standing order so 1 for seven days"** (Wispr only).
- A restart that nothing explained can't be granted a standing order. WisprOps won't automate a guess.

## Freeze

**"freeze production"** (or the Freeze button, or `wisprops freeze`) stops every change: your approvals, undo and every standing order. WisprOps keeps watching and paging. Making things safer never needs Wispr. **"unfreeze production"** has to be dictated with Wispr Flow, and there is no button or endpoint for it. `"settings": {"applyEnabled": false}` switches changes off in the config, and voice can't override that.

## Paging, acknowledgement and the morning handoff

```jsonc
"notify": {
  "ntfy": "my-secret-topic",          // your phone, through the free ntfy app
  "webhook": "$SLACK_WEBHOOK_URL",    // Slack or Discord; "$VARS" are read from the environment
  "pagerduty": "$PD_ROUTING_KEY",     // Events API v2: pages trigger, verified recoveries resolve
  "escalate": { "ntfy": "backup-person-topic" },
  "telegram": { "token": "$TELEGRAM_BOT_TOKEN", "chat": "123456789" }  // pages with buttons; safe replies
},
"settings": { "escalateAfterMin": 15, "handoffHour": 7 }
```

- Say **"I'm on it"** (or answer the page in any way) to acknowledge. If nobody does within `escalateAfterMin`, the backup is paged once.
- A verified recovery sends an all-clear: *go back to sleep*.
- At `handoffHour` you get the morning handoff: what broke, what was fixed, who was woken, the notes you dictated, what still needs you. The console can read it aloud.
- **Telegram:** pages arrive with **What happened?** and **I'm on it** buttons, plus a console link when you have a public URL. Reply with Wispr Flow's phone keyboard: `/status`, `/orders`, `/handoff`, "I'm on it", "note: …", "snooze checkout for thirty minutes", "freeze production". Anything that changes production is refused before the agent sees it. It uses long-polling, so no public URL is needed, and messages sent while WisprOps was down are skipped.
- **Maintenance windows:** "snooze checkout api for thirty minutes" keeps watching but opens no incident and sends no page until it ends or you say "resume paging".

## Alerts from your monitoring

Set `alerts.token`, then point your tools at `http://localhost:7300/api/alert`. Firing alerts open an incident (or join the open one); resolved alerts are ignored, because WisprOps proves recovery itself.

```yaml
# Prometheus Alertmanager
receivers:
  - name: wisprops
    webhook_configs:
      - url: http://localhost:7300/api/alert
        http_config: { authorization: { credentials: "<alerts.token>" } }
```

- **Grafana:** contact point → Webhook → `http://localhost:7300/api/alert`, header `Authorization: Bearer <alerts.token>`.
- **Uptime Kuma:** Webhook → `http://localhost:7300/api/alert?service=api&token=<alerts.token>`.
- **Anything else:** `POST {"service": "api", "summary": "error rate over 5%"}` with the bearer token.

The service is taken from the `service` / `app` / `job` label, or `?service=<id>`.

## Answer a page from your phone

1. Install [ntfy](https://ntfy.sh), subscribe to a secret topic, set `notify.ntfy`.
2. Put an HTTPS tunnel in front of port 7300 (Cloudflare Tunnel, Tailscale Serve, ngrok…).
3. `node bin/wisprops.js token --host <tunnel hostname>`, restart, then `node bin/wisprops.js token --show` and open that link once on your phone. It signs the phone in for 30 days (an HttpOnly cookie that is not the token itself). Rotate with `token --rotate`.
4. Tap the page, then dictate into the Talk box with Wispr Flow on your phone if you have it. The console is a phone-friendly, installable page.

Without `access.hosts`, WisprOps answers only on localhost.

## Postmortems and pull requests

Every incident has a Markdown postmortem: evidence, the changes before it broke, timeline, consent receipts with digests, **in your own words** (everything you said, and how it arrived), notes, follow-ups.

Every receipt also has an **approval record**: the words, how they arrived, the allowlisted action and its parameters, the dry run, the change behind it, the checks that proved recovery, and the digest (which shows edits but is not a signature). Open it from the Audit page, `GET /api/certificate?id=…`, or the MCP tool.

Set `repo` on a service and say **"open the pull request"**. WisprOps works in a throwaway `git worktree`, so your checkout is never touched. It commits the postmortem, plus the config fix to `config.source` if that file still has the bad value. With `"pr": {"push": true}` it pushes and opens a **draft** PR with the GitHub CLI. Nothing is merged at 3 AM.

## MCP: Claude Code next to Wispr Flow

```bash
claude mcp add --transport http wispr-flow https://api.wisprflow.ai/connect/mcp
claude mcp add wisprops -- node /path/to/wisprops/bin/wisprops.js mcp
```

Tools: `list_incidents`, `get_incident`, `get_postmortem`, `get_handoff`, `list_receipts`, `list_standing_orders`, `list_services`, `get_runbook`, `list_changes`, `get_approval_record`, and two writes: `add_incident_note`, `add_runbook_note`.

Try: *"Find the decision about db_pool in yesterday's Wispr Flow meeting summary and add it to the checkout-api runbook in WisprOps."*

**There is deliberately no MCP tool that approves, applies, undoes, acknowledges or snoozes.** An AI assistant can never sign off on a change to production. Only you can, out loud, with Wispr.

## Configuration reference

```jsonc
{
  "port": 7300,
  "publicUrl": "",                       // link used in pages; defaults to the first access host
  "settings": {
    "intervalMs": 5000, "failAfter": 2, "goldenAfter": 3, "verifyOk": 3, "verifyWindowMs": 60000,
    "allowTyped": false, "sayItBack": true, "handoffHour": 7, "escalateAfterMin": 15, "maxOrderDays": 30, "maxOrderUses": 10,
    "applyEnabled": true, "nightFrom": 22, "nightTo": 8
  },
  "notify": { "ntfy": "", "ntfyServer": "", "ntfyToken": "", "webhook": "", "pagerduty": "", "escalate": { "ntfy": "", "webhook": "" }, "telegram": { "token": "", "chat": "" } },
  "access": { "token": "", "hosts": [] },
  "alerts": { "token": "" },
  "pr": { "push": false, "remote": "origin" },
  "services": [{
    "id": "api",
    "health": { "url": "http://localhost:3000/healthz", "timeoutMs": 3000, "expect": 200, "contains": "", "maxMs": 0, "headers": {} },
    // or "health": "tcp://localhost:5432", or "health": { "command": ["pg_isready", "-h", "localhost"] }
    "preset": { "type": "docker", "container": "api" },
    "config": { "file": "./config/api.json", "source": "config/api.json" },
    "reload": ["docker", "kill", "-s", "HUP", "api"],
    "release": { "command": ["git", "-C", ".", "rev-parse", "--short", "HEAD"] },
    "rollback": ["./scripts/deploy.sh", "{to}"],
    "logs": "./logs/api.log",
    "repo": "."
  }]
}
```

Only `id` and `health` are required. State lives in `.wisprops/state.json` next to the config.

## Security

- The **Settings** page changes paging channels and quiet hours only. Secrets are write-only (the console only ever sees "set" and a short hint). Anything that makes WisprOps less careful (`allowTyped`, `sayItBack`, `applyEnabled`, standing-order caps, access and alert tokens) can only be changed in the config file.
- The server binds to `127.0.0.1`. If you bind it wider (`WISPROPS_BIND`, e.g. in a container without host networking), only real loopback connections count as local; everyone else signs in with the access token. Requests need a localhost `Host` header (blocks DNS rebinding) unless the host is in `access.hosts`. A request that came through a proxy (`X-Forwarded-For`, `Forwarded`, `Cf-Connecting-Ip`…) is never treated as local.
- Reading is open on localhost (the MCP server reads). **Every write that can change something needs a signed-in console**: the `wisprops start` link on this machine, or the access-token link through your tunnel. Adding a note is the only write without it, because a note cannot change production. Sign-in and alert-token failures are rate-limited.
- Writes must be same-origin JSON. Pages are served with a strict Content-Security-Policy.
- Only the console's own input tracking can claim a Wispr burst. The demo's "simulated Wispr" label, MCP and buttons are always treated as typing; the demo script stops the moment you leave the sandbox.
- If WisprOps restarts while applying a fix, it escalates instead of guessing whether the change landed.
- Secrets can be `$ENV_VARS` instead of literal values.
- Audit exports neutralise spreadsheet formulas.
- **What you say is stored redacted:** emails, phone and card numbers, and anything that looks like a key or password become `[email]`, `[number]`, `[secret]` before they reach the timeline, notes, runbooks or state file. The consent check reads the words in memory first.
- Services added from the console may only name files inside the folder that holds the config.
- Telegram replies can never approve, undo, grant, renew, unfreeze or open a PR. They're refused before the agent sees them.
- **Known limits:** the Wispr check proves "not typed key by key", not "spoken" (paste looks the same), and it covers the console's input path. A program running as your user can read the console key from `.wisprops/secret`, just as it could run your restart command itself, so treat that machine account as trusted. There is one operator identity. WisprOps is not a replacement for your monitoring; it is the thing that answers it.

## Develop

```bash
node --test               # agent, ledger, rules, freeze, Telegram, server security, a live end-to-end run (real service, real server, MCP over stdio), and the judge night
node bin/wisprops.js judge
```

No dependencies. Node 18.17 or newer.

## License

MIT © Ayush Agarwal
