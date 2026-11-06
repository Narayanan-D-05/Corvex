"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { reducedMotion } from "@/lib/motion";

/** The cursor, -1 to 1 across the window. The canvas ignores pointer events, so it is read from the window. */
const cursor = { x: 0, y: 0, sx: 0, sy: 0 };

type Shape = "box" | "sphere" | "capsule" | "ring";
type Piece = { shape: Shape; pos: [number, number, number]; size: number; color: string; spin: number; depth: number; phase: number; squash?: [number, number, number] };

const LIME = "#c9ff5c";
const MOSS = "#4f9a52";
const DEEP = "#173d30";
const TEAL = "#2f9d8a";
const BONE = "#e8eee4";

/** Soft clay pieces around the product card: order chips, a pebble, and the ring of the cross. */
const presets: Record<"hero" | "ring", Piece[]> = {
  hero: [
    { shape: "box", pos: [-1.6, 2.6, -1.6], size: 1.0, color: LIME, spin: 0.18, depth: 1.0, phase: 0, squash: [1.4, 0.85, 0.7] },
    { shape: "sphere", pos: [3.4, 2.5, -1.6], size: 0.7, color: TEAL, spin: 0.1, depth: 0.7, phase: 1.3 },
    { shape: "capsule", pos: [-1.9, -3.1, -1.0], size: 0.5, color: BONE, spin: 0.22, depth: 1.2, phase: 2.1 },
    { shape: "box", pos: [3.6, -2.4, -1.0], size: 1.0, color: MOSS, spin: 0.16, depth: 0.9, phase: 3.2, squash: [1.2, 1, 0.8] },
    { shape: "ring", pos: [1.4, 3.3, -2.4], size: 1.0, color: LIME, spin: 0.25, depth: 0.5, phase: 0.7 },
    { shape: "sphere", pos: [1.6, -3.2, -0.6], size: 0.45, color: DEEP, spin: 0.12, depth: 1.4, phase: 4.1 },
    { shape: "capsule", pos: [2.4, 0.4, 0.8], size: 0.32, color: LIME, spin: 0.3, depth: 1.8, phase: 5.0 },
  ],
  ring: [
    { shape: "ring", pos: [6.2, -0.4, -2.0], size: 1.6, color: LIME, spin: 0.12, depth: 0.4, phase: 0 },
    { shape: "ring", pos: [6.2, -0.4, -2.0], size: 1.0, color: BONE, spin: -0.2, depth: 0.7, phase: 1 },
    { shape: "box", pos: [-6.2, 1.2, -1.0], size: 0.8, color: MOSS, spin: 0.2, depth: 1.1, phase: 2, squash: [1.3, 0.9, 0.8] },
    { shape: "sphere", pos: [-5.0, -2.0, -0.8], size: 0.6, color: TEAL, spin: 0.1, depth: 1.0, phase: 3 },
    { shape: "capsule", pos: [4.2, 2.6, -0.4], size: 0.4, color: BONE, spin: 0.25, depth: 1.5, phase: 4 },
    { shape: "box", pos: [3.8, -2.6, -0.3], size: 0.5, color: LIME, spin: 0.3, depth: 1.6, phase: 5, squash: [1.2, 1, 0.8] },
  ],
};

/** Pores like the clay in the reference: a fine noise bump. */
function useClayBump() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 3800; i++) {
      const v = 90 + rnd() * 90;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }, []);
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Pebble({ piece, bump, still }: { piece: Piece; bump: THREE.Texture; still: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    switch (piece.shape) {
      case "box":
        return new RoundedBoxGeometry(1, 1, 1, 6, 0.3);
      case "sphere":
        return new THREE.SphereGeometry(1, 48, 48);
      case "capsule":
        return new THREE.CapsuleGeometry(0.5, 1.3, 12, 32);
      case "ring":
        return new THREE.TorusGeometry(1, 0.22, 36, 96);
    }
  }, [piece.shape]);
  const s = piece.shape === "box" || piece.shape === "sphere" ? piece.size : piece.size;
  const sq = piece.squash ?? [1, 1, 1];

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = still ? 0 : clock.elapsedTime;
    const px = still ? 0 : cursor.sx;
    const py = still ? 0 : cursor.sy;
    // each piece circles its own anchor, bobs, spins, and leans toward the cursor at its own depth
    const a = t * 0.55 * (piece.spin > 0 ? 1 : -1) + piece.phase;
    m.position.x = piece.pos[0] + Math.cos(a) * 0.35 + px * piece.depth * 1.3;
    m.position.y = piece.pos[1] + Math.sin(a * 1.3) * 0.35 + py * piece.depth * 0.9;
    m.position.z = piece.pos[2] + Math.sin(a) * 0.3;
    m.rotation.x = piece.phase + t * piece.spin * 2.4 + py * 0.5;
    m.rotation.y = piece.phase * 0.6 + t * piece.spin * 2.0 + px * 0.7;
    m.rotation.z = Math.sin(a * 0.7) * 0.3;
  });

  return (
    <mesh ref={ref} geometry={geo} scale={[s * sq[0], s * sq[1], s * sq[2]]} position={piece.pos}>
      <meshPhysicalMaterial color={piece.color} roughness={0.62} metalness={0} clearcoat={0.1} clearcoatRoughness={0.7} bumpMap={bump} bumpScale={0.9} sheen={0.4} sheenColor={new THREE.Color("#ffffff")} />
    </mesh>
  );
}

function Pieces({ preset, still }: { preset: "hero" | "ring"; still: boolean }) {
  const bump = useClayBump();
  // ease the cursor so the scene glides instead of jumping
  useFrame(() => {
    cursor.sx += (cursor.x - cursor.sx) * 0.06;
    cursor.sy += (cursor.y - cursor.sy) * 0.06;
  });
  return (
    <>
      {presets[preset].map((p, i) => (
        <Pebble key={i} piece={p} bump={bump} still={still} />
      ))}
    </>
  );
}

/** Real 3D, in clay. The pieces drift on their own and lean toward the cursor, each at its own depth. */
export default function ClayScene({ preset = "hero" }: { preset?: "hero" | "ring" }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      cursor.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursor.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", move, { passive: true });
    setStill(reducedMotion());
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <div ref={wrap} className="h-full w-full">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 10], fov: 38 }} frameloop={visible && !still ? "always" : "demand"} gl={{ antialias: true, alpha: true }}>
        <Environment />
        <ambientLight intensity={0.15} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} color="#fff6e0" />
        <directionalLight position={[-4, -2, 3]} intensity={0.8} color={LIME} />
        <Pieces preset={preset} still={still} />
      </Canvas>
    </div>
  );
}
