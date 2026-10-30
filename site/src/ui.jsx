// Everything drawn in HTML on top of the 3D scene: loader, top bar, the story captions, scroll hint, credits and footer.
import { useProgress } from "@react-three/drei";
import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { SplitText } from "gsap/SplitText";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CONSOLE, CREDITS, FOOTER_COLS, REPO, STEPS } from "./content";
import { isMobile, useScrollStore, useThemeStore } from "./store";

gsap.registerPlugin(SplitText, ScrambleTextPlugin);
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ProgressLoader({ progress }) {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  const p = Math.max(0, Math.min(100, progress));
  if (isMobile) {
    return (
      <div className="loader-m" style={{ opacity: p === 100 ? 0 : 0.8 }}>
        <div className="loader-m__track" /><div className="loader-m__bar" style={{ width: p + "%" }} />
        <div className="loader-m__n">{p.toFixed(0)}%</div>
      </div>
    );
  }
  const sw = 3, W = Math.max(0, size.w - 16), H = Math.max(0, size.h - 16), rw = W - sw, rh = H - sw;
  if (rw <= 0 || rh <= 0) return null;
  const per = 2 * (rw + rh);
  return (
    <div className="loader">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <rect x="1" y="1" width={rw} height={rh} fill="none" strokeWidth={sw} stroke="rgba(0,0,0,.2)" />
        <rect x="1" y="1" width={rw} height={rh} fill="none" strokeWidth={sw} stroke="rgba(255,255,255,.75)"
          style={{ strokeDasharray: per, strokeDashoffset: per - (per * p) / 100, transition: "stroke-dashoffset 1s ease-in-out" }} />
      </svg>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#fff" />
      <path d="M8 16h2M12 11v10M16 8v16M20 11v10M24 14v4" stroke="#1d5bd8" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar() {
  const nextTheme = useThemeStore((s) => s.nextTheme);
  const theme = useThemeStore((s) => s.theme);
  const progress = useScrollStore((s) => s.scrollProgress);
  const hide = isMobile && progress > 0.9; // on a phone the title needs the top of the screen at the end
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.color); }, [theme.color]);
  return (
    <header className="bar" style={{ opacity: hide ? 0 : 1, pointerEvents: hide ? "none" : "auto" }}>
      <a className="bar__brand" href="./"><Logo /><span>WisprOps</span></a>
      <nav className="bar__nav">
        <a href={CONSOLE}>Demo</a>
        <a href={REPO} target="_blank" rel="noopener">GitHub</a>
        <button className="bar__sky" onClick={nextTheme} title={theme.type === "night" ? "Switch to day" : "Switch to night"} aria-label="Switch sky">
          <img src="night-mode.svg" width="22" height="22" alt="" />
        </button>
      </nav>
    </header>
  );
}

// The first screen: what this is, in two sentences, and where to go.
export function HeroCopy({ onScrollDown }) {
  const progress = useScrollStore((s) => s.scrollProgress);
  const { progress: loaded } = useProgress();
  const ref = useRef(null);
  const show = loaded === 100 && progress < 0.03;
  const first = useRef(true);

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (show && first.current && !still()) {
      first.current = false;
      gsap.fromTo(ref.current.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.12, delay: 2.2, ease: "power3.out" });
    }
  }, [show]);

  return (
    <section className={"hero" + (show ? " on" : "")} ref={ref}>
      <p className="hero__kicker">WisprOps · an on-call agent for your servers</p>
      <p className="hero__lede">
        When production breaks at night, it finds the cause, proposes one safe fix and pages you.
        Say the fix back with Wispr Flow, <q>approve fix one, db_pool back to 20</q>, and it applies it, proves it held, and handles the same fault itself next time.
      </p>
      <div className="hero__cta">
        <a className="btn btn--solid" href={CONSOLE}>▶ Play the demo</a>
        <button className="btn" onClick={onScrollDown}>Show me how ↓</button>
      </div>
    </section>
  );
}

// One caption per stage of the night, revealed word by word with the time decoding in.
export function Story() {
  const progress = useScrollStore((s) => s.scrollProgress);
  const idx = STEPS.findIndex((s) => progress >= s.from && progress < s.to);
  const step = STEPS[idx];
  const box = useRef(null), time = useRef(null), title = useRef(null), body = useRef(null);

  useLayoutEffect(() => {
    if (!step || !box.current) return;
    if (still()) return;
    const split = SplitText.create(title.current, { type: "words", mask: "words" });
    const tl = gsap.timeline();
    tl.fromTo(box.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 })
      .to(time.current, { duration: 0.9, scrambleText: { text: step.time, chars: "0123456789:", speed: 0.6 } }, 0)
      .from(split.words, { yPercent: 110, opacity: 0, stagger: 0.04, duration: 0.6, ease: "power3.out" }, 0.05)
      .fromTo(body.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6 }, 0.25);
    return () => { tl.kill(); split.revert(); };
  }, [idx]);

  if (!step) return null;
  return (
    <aside className="story" ref={box} aria-live="polite">
      <div className="story__meta">
        <span className="story__time" ref={time}>{step.time}</span>
        <span className="story__n">{String(idx + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</span>
      </div>
      <h2 className="story__title" ref={title} key={"t" + idx}>{step.title}</h2>
      <p className="story__body" ref={body}>{step.body}</p>
      <div className="story__track"><span style={{ width: Math.min(100, ((progress - STEPS[0].from) / (1 - STEPS[0].from)) * 100) + "%" }} /></div>
    </aside>
  );
}

export function Hints() {
  const progress = useScrollStore((s) => s.scrollProgress);
  const { progress: loaded } = useProgress();
  const scroll = loaded === 100 && progress < 0.01;
  return (
    <div className={"scroll-hint" + (scroll ? " on" : "")}>
      <img src="chevrons-up-down.svg" width="18" height="18" alt="" /><span>SCROLL</span>
    </div>
  );
}

export function Credits() {
  const [open, setOpen] = useState(false);
  const progress = useScrollStore((s) => s.scrollProgress);
  const hidden = progress > 0.9 || (isMobile && progress > 0.03); // the story card, then the footer, own the bottom
  useEffect(() => { const o = () => setOpen(true); window.addEventListener("open-credits", o); return () => window.removeEventListener("open-credits", o); }, []);
  return (
    <>
      <button className="credits-btn" style={{ opacity: hidden ? 0 : 0.75, pointerEvents: hidden ? "none" : "auto" }} onClick={() => setOpen(true)}>© 2026 Ayush Agarwal · Credits</button>
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Credits" onClick={() => setOpen(false)}>
          <div className="modal__card" onClick={(e) => e.stopPropagation()}>
            <h3>Credits</h3>
            <ul>{CREDITS.map((c) => <li key={c.what}><b>{c.what}</b><span>{c.who}</span><a href={c.url} target="_blank" rel="noopener">source ↗</a></li>)}</ul>
            <p>WisprOps is MIT licensed. Made for No Hands: The Wispr Challenge. Not affiliated with Wispr.</p>
            <button className="btn" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// The footer that rises at the end of the scroll.
export function SiteFooter() {
  const progress = useScrollStore((s) => s.scrollProgress);
  const on = progress > 0.93;
  return (
    <footer className={"site-footer" + (on ? " on" : "")} aria-hidden={!on} inert={on ? undefined : ""}>
      <div className="sf-top">
        <div className="sf-brand">
          <div className="sf-name"><img src="icon.svg" width="30" height="30" alt="" />WisprOps</div>
          <p>An on-call agent for the services you run yourself. It finds the cause, proposes one safe fix, and applies it only when you say it back with Wispr Flow.</p>
          <div className="sf-cta"><a className="btn btn--solid" href={CONSOLE}>▶ Play the demo</a><a className="btn" href={REPO} target="_blank" rel="noopener">GitHub ↗</a></div>
        </div>
        <nav className="sf-cols" aria-label="Footer">
          {FOOTER_COLS.map((col) => (
            <div key={col.label} className="sf-col">
              <div className="sf-label">{col.label}</div>
              {col.links.map((l) => l.credits
                ? <button key={l.text} className="sf-link" onClick={() => window.dispatchEvent(new Event("open-credits"))}>{l.text}</button>
                : <a key={l.text} className="sf-link" href={l.href} target={l.ext ? "_blank" : undefined} rel={l.ext ? "noopener" : undefined}>{l.text}</a>)}
            </div>
          ))}
        </nav>
      </div>
      <div className="sf-wordmark" aria-hidden="true">WisprOps</div>
      <div className="sf-line">
        <span>© 2026 Ayush Agarwal · MIT license</span>
        <span>Made for No Hands: The Wispr Challenge · not affiliated with Wispr</span>
        <span>Sleep. I'm on call.</span>
      </div>
    </footer>
  );
}
