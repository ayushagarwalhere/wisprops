// The sky, the title, the cards that float past on the way down, and the window.
import { Cloud, Clouds, Stars, Text, useProgress, useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CARDS, PANES, SERIF, SOFT } from "./content";
import { WindowModel } from "./models";
import { isMobile, useScrollStore, useThemeStore } from "./store";

// Moves the camera as you scroll: look down through the clouds, drop to the window, then pull back over the night.
export function ScrollWrapper({ children }) {
  const { camera } = useThree();
  const data = useScroll();
  const setScrollProgress = useScrollStore((s) => s.setScrollProgress);

  useFrame((state, delta) => {
    const a = data.range(0, 0.3);
    const b = data.range(0.3, 0.5);
    const d = data.range(0.85, 0.18);
    camera.rotation.x = THREE.MathUtils.damp(camera.rotation.x, -0.5 * Math.PI * a, 5, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, -37 * b, 7, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 5 + 10 * d, 7, delta);
    setScrollProgress(data.range(0, 1));
    if (!isMobile) {
      camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, -(state.pointer.x * Math.PI) / 90, 0.05);
    }
  });
  return <>{[].concat(children).map((c, i) => <group key={i}>{c}</group>)}</>;
}

export function Hero() {
  const titleRef = useRef(null);
  const { progress } = useProgress();
  useEffect(() => {
    if (progress === 100 && titleRef.current) {
      gsap.fromTo(titleRef.current.position, { y: -10 }, { y: 2, duration: 3 });
    }
  }, [progress]);

  return (
    <>
      <Text position={[0, -10, -10]} font={SERIF} fontSize={isMobile ? 0.9 : 1.3} maxWidth={isMobile ? 7 : 30} textAlign="center" ref={titleRef}>
        Sleep. I'm on call.
      </Text>
      <Sky />
      <CloudContainer />
      <IncidentCards />
      <group position={[0, -25, 5.69]}>
        <pointLight castShadow position={[1, 1, -2.5]} intensity={60} distance={10} />
        <WindowModel receiveShadow />
        <TextWindow />
      </group>
    </>
  );
}

// Stars only at night, but always some faint ones so the sky never looks empty.
function Sky() {
  const night = useThemeStore((s) => s.theme.type === "night");
  return night
    ? <Stars radius={200} depth={100} count={5000} factor={10} saturation={10} fade speed={1} />
    : <Stars radius={200} depth={100} count={900} factor={6} saturation={0} fade speed={0.5} />;
}

function CloudContainer() {
  return (
    <Clouds texture="cloud.png" material={THREE.MeshBasicMaterial} position={[0, -5, 0]} frustumCulled={false}>
      <Cloud seed={1} segments={1} concentrate="inside" bounds={[10, 10, 10]} growth={3} position={[-1, 0, 0]} smallestVolume={2} scale={1.9} volume={2} speed={0.2} fade={5} />
      <Cloud seed={3} segments={1} concentrate="outside" bounds={[10, 10, 10]} growth={2} position={[2, 0, 2]} smallestVolume={2} scale={1} volume={2} fade={3} speed={0.1} />
      <Cloud seed={4} segments={1} concentrate="outside" bounds={[10, 20, 15]} growth={4} position={[-10, -10, 4]} smallestVolume={2} scale={2} speed={0.2} volume={3} />
      <Cloud seed={5} segments={1} concentrate="outside" bounds={[5, 5, 5]} growth={2} position={[6, -3, 8]} smallestVolume={2} scale={2} volume={2} fade={0.1} speed={0.1} />
      <Cloud seed={6} segments={1} concentrate="outside" bounds={[5, 5, 5]} growth={2} position={[0, -20, 20]} smallestVolume={2} scale={4} volume={3} fade={0.1} speed={0.1} />
      <Cloud seed={7} segments={1} concentrate="outside" bounds={[5, 5, 5]} growth={2} position={[10, -15, -5]} smallestVolume={2} scale={3} volume={3} fade={0.1} speed={0.1} />
    </Clouds>
  );
}

// The page, the cause and the fix: three cards you fall past. Each one swings flat and slides in as it comes up.
function IncidentCards() {
  return <>{CARDS.map((c, i) => <IncidentCard key={i} card={c} />)}</>;
}

function IncidentCard({ card }) {
  const ref = useRef(null);
  const plate = useRef(null);
  const texts = useRef(null);
  const data = useScroll();
  const w = 3.1, h = 0.62 + card.lines.length * 0.26;
  const x = isMobile ? card.side * 0.35 : card.side * 2.55;
  const scale = isMobile ? 0.62 : 1.2;

  useFrame((_, delta) => {
    const t = data.range(card.range[0], card.range[1]); // 0 far away, 1 in place
    const g = ref.current;
    if (!g) return;
    const off = 1 - t;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -Math.PI / 2 + off * 1.1, 6, delta);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, card.side * off * 0.5, 6, delta);
    g.position.x = THREE.MathUtils.damp(g.position.x, x + card.side * off * 3, 6, delta);
    if (plate.current) plate.current.material.opacity = 0.16 + 0.7 * t;
    if (texts.current) texts.current.children.forEach((c) => { c.fillOpacity = t; });
  });

  return (
    <group ref={ref} position={[x, card.y, 5]} rotation={[-Math.PI / 2, 0, 0]} scale={scale}>
      <mesh ref={plate}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[-w / 2 + 0.035, 0, 0.002]}>
        <planeGeometry args={[0.07, h]} />
        <meshBasicMaterial color="#1d5bd8" />
      </mesh>
      <group ref={texts} position={[-w / 2 + 0.2, h / 2 - 0.16, 0.01]}>
        <Text font={SOFT} fontSize={0.12} color="#1d5bd8" anchorX="left" anchorY="top" letterSpacing={0.08}>{card.tag}</Text>
        <Text font={SERIF} fontSize={0.3} color="#0b1838" anchorX="left" anchorY="top" position={[0, -0.18, 0]} maxWidth={w - 0.35}>{card.title}</Text>
        {card.lines.map((l, i) => (
          <Text key={i} font={SOFT} fontSize={0.13} color="#24314f" anchorX="left" anchorY="top" position={[0, -0.6 - i * 0.24, 0]} maxWidth={w - 0.35}>{l}</Text>
        ))}
      </group>
    </group>
  );
}

// What it does, written on the window panes. The panes turn as the window opens.
function TextWindow() {
  const data = useScroll();
  const windowRef = useRef(null);
  useFrame(() => {
    const c = data.range(0.65, 0.15);
    if (windowRef.current) {
      windowRef.current.setRotationFromAxisAngle(new THREE.Vector3(0, -1, 0), 0.5 * Math.PI * c);
      windowRef.current.position.x = -0.6 * c;
      windowRef.current.position.z = -0.6 * c;
    }
  });
  const f = { font: SERIF, color: "white", anchorY: "middle" };
  return (
    <group position={[0, -0.3, 0]} ref={windowRef}>
      <Text {...f} anchorX="left" fontSize={1.3} position={[0.12, 0, 0]} scale={[1, -1, 1]} rotation={[0, 0, -Math.PI / 2]}>{PANES.front}</Text>
      <Text {...f} anchorX="right" fontSize={1.3} position={[0.12, 0, -1.4]} scale={[-1, -1, 1]} rotation={[0, 0, -Math.PI / 2]}>{PANES.back}</Text>
      <group position={[-0.45, 0, -0.3]}>
        <Text {...f} anchorX="left" fontSize={0.8} scale={[1, -1, 1]} rotation={[0, -Math.PI / 2, -Math.PI / 2]}>{PANES.left[0]}</Text>
        <Text {...f} anchorX="left" fontSize={0.8} position={[0, 0, -0.6]} scale={[1, -1, 1]} rotation={[0, -Math.PI / 2, -Math.PI / 2]}>{PANES.left[1]}</Text>
      </group>
      <group position={[0.45, 0, -0.3]}>
        <Text {...f} anchorX="right" fontSize={0.8} scale={[-1, -1, 1]} rotation={[0, -Math.PI / 2, -Math.PI / 2]}>{PANES.right[0]}</Text>
        <Text {...f} anchorX="right" fontSize={0.8} position={[0, 0, -0.6]} scale={[-1, -1, 1]} rotation={[0, -Math.PI / 2, -Math.PI / 2]}>{PANES.right[1]}</Text>
      </group>
    </group>
  );
}
