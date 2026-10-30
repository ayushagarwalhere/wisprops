import { useGSAP } from "@gsap/react";
import { AdaptiveDpr, Preload, ScrollControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { Suspense, useRef } from "react";
import { WindowModel } from "./models";
import { ScrollTag } from "./scrolltag";
import { Hero, ScrollWrapper } from "./scene";
import { isMobile, useThemeStore } from "./store";
import { Credits, HeroCopy, Hints, ProgressLoader, SiteFooter, Story, TopBar } from "./ui";

const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E\")";

// Mount every model once, hidden, so nothing pops in mid-scroll.
function Preloader() {
  return <><WindowModel visible={false} /></>;
}

export default function App() {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const color = useThemeStore((s) => s.theme.color);
  const { progress } = useProgress();

  useGSAP(() => {
    if (progress === 100) gsap.to(".base-canvas", { opacity: 1, duration: 3, delay: 1 });
  }, [progress]);

  useGSAP(() => {
    gsap.to(wrap.current, { backgroundColor: color, duration: 1 });
    gsap.to(canvas.current, { backgroundColor: color, duration: 1, backgroundBlendMode: "soft-light", backgroundImage: NOISE, backgroundRepeat: "repeat", backgroundSize: "100px" });
  }, [color]);

  // "Show me how": glide the main scroll to the first stage of the story.
  const scrollDown = () => {
    const el = document.querySelector('div[data-scroll="main"]');
    if (el) el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * 0.12, behavior: "smooth" });
  };

  const style = {
    position: "absolute", inset: 0, opacity: 0, overflow: "hidden",
    ...(!isMobile && { inset: "1rem", width: "calc(100% - 2rem)", height: "calc(100% - 2rem)" }),
  };

  return (
    <div className="wrapper">
      <div className="stage" ref={wrap}>
        <Canvas className="base-canvas" shadows style={style} ref={canvas} dpr={[1, 2]}>
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <ScrollControls pages={5} damping={0.4} maxSpeed={1} distance={1} style={{ zIndex: 1 }}>
              <ScrollTag name="main" />
              <ScrollWrapper>
                <Hero />
              </ScrollWrapper>
              <Preloader />
            </ScrollControls>
            <Preload all />
          </Suspense>
          <AdaptiveDpr pixelated />
        </Canvas>
        <ProgressLoader progress={progress} />
      </div>
      <TopBar />
      <HeroCopy onScrollDown={scrollDown} />
      <Story />
      <Hints />
      <SiteFooter />
      <Credits />
    </div>
  );
}
