// Everything the site says, in one place.
export const REPO = "https://github.com/ayushagarwalhere/wisprops";
export const CONSOLE = "console.html#/demo";
export const SOFT = "fonts/vercetti.woff";
export const SERIF = "fonts/soria.ttf";

// The story, told while you scroll down from the sky to the window. Ranges are scroll fractions (0 to 1).
export const STEPS = [
  { from: 0.04, to: 0.26, time: "03:12 AM", title: "Production breaks. You're asleep.", body: "checkout-api starts returning 502s. WisprOps is the one who's awake." },
  { from: 0.26, to: 0.46, time: "03:12 AM", title: "It finds the cause.", body: "Logs, health checks and every change from the last hour. It only blames a change it can prove." },
  { from: 0.46, to: 0.62, time: "03:13 AM", title: "It proposes one fix.", body: "One of three safe actions, already dry-run. Then it pages you with a single sentence." },
  { from: 0.62, to: 0.8, time: "03:14 AM", title: "You say the fix back. Out loud.", body: "“Approve fix one, db_pool back to 20,” in one Wispr Flow dictation. Every fact is checked against the fix: say 10, or the wrong service, and nothing runs. A typed yes is refused." },
  { from: 0.8, to: 0.94, time: "03:15 AM", title: "It proves the fix held, and you sleep through the next one.", body: "Three healthy checks in a row, or it escalates to you. A standing order handles the same fault next time. In the morning, a minute of talk becomes the postmortem." },
];

// Cards that float past on the way down.
export const CARDS = [
  {
    y: -6, side: 1, range: [0.12, 0.16], tag: "PAGE · 03:12", title: "checkout-api is down",
    lines: ["502 on /pay for 41 s · 3 checks failed", "Paged: you, on Telegram"],
  },
  {
    y: -11.5, side: -1, range: [0.25, 0.13], tag: "CAUSE · exact match · 9 s", title: "db_pool went 20 → 0",
    lines: ["Changed by deploy-bot at 03:04", "8 minutes before the first error", "Log: “pool exhausted, 0 free”"],
  },
  {
    y: -17, side: 1, range: [0.33, 0.13], tag: "FIX 1 · dry-run passed", title: "Set db_pool back to 20",
    lines: ["Action: roll back config (1 of 3 allowed)", "Say it back: “approve fix one, db_pool back to 20”", "Wrong value or typed: refused"],
  },
];

// Written on the window panes.
export const PANES = {
  front: "FINDS THE CAUSE",
  back: "FIXES IT SAFELY",
  left: ["PROVES IT WORKED", "ASKS BEFORE IT ACTS"],
  right: ["NEVER TWICE", "WRITES THE POSTMORTEM"],
};

// The footer at the end of the scroll.
export const FOOTER_COLS = [
  { label: "Try it", links: [
    { text: "Play the demo", href: CONSOLE },
    { text: "Watch the 3 AM night", href: CONSOLE },
    { text: "Install in a minute", href: REPO + "#install-and-first-run-one-minute", ext: true },
    { text: "Docs", href: "console.html#/docs" },
  ] },
  { label: "How it works", links: [
    { text: "Say the fix back", href: "console.html#/wispr" },
    { text: "Standing orders", href: "console.html#/orders" },
    { text: "Approval records", href: "console.html#/receipts" },
    { text: "How it stays safe", href: REPO + "#security", ext: true },
  ] },
  { label: "Code", links: [
    { text: "GitHub", href: REPO, ext: true },
    { text: "README", href: REPO + "#readme", ext: true },
    { text: "MIT license", href: REPO + "/blob/main/LICENSE", ext: true },
  ] },
  { label: "About", links: [
    { text: "No Hands: The Wispr Challenge", href: "https://www.wemakedevs.org/wispr", ext: true },
    { text: "Wispr Flow", href: "https://wisprflow.ai", ext: true },
    { text: "Credits", credits: true },
  ] },
];

export const CREDITS = [
  { what: "Site design and 3D intro", who: "adapted from Mohit Virli's open portfolio template", url: "https://github.com/mohitvirli/mohitvirli.github.io" },
  { what: "“Residential Window” model", who: "AleixoAlonso, CC BY 4.0", url: "https://sketchfab.com/3d-models/residential-window-ae11104237314463a61251fd46ded4b4" },
];
