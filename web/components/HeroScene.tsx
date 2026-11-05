"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const COUNT = 360;

type Progress = React.MutableRefObject<number>;

function Orders({ progress, still }: { progress: Progress; still: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { start, target, colors } = useMemo(() => {
    const start = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COUNT; i++) {
      start.set([(rnd() - 0.5) * 17, (rnd() - 0.5) * 8, (rnd() - 0.5) * 3], i * 3);
      const t = rnd();
      target.set([2.6 + (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.22, (rnd() - 0.5) * 0.4], i * 3);
      const buy = i % 2 === 0;
      (buy ? [0.55, 0.68, 1.0] : [0.88, 0.92, 0.98]).forEach((c, k) => (colors[i * 3 + k] = c * (0.7 + t * 0.3)));
    }
    return { start, target, colors };
  }, []);
  const pos = useMemo(() => new Float32Array(start), [start]);
  const dot = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    const p = still ? 1 : progress.current;
    const t = clock.elapsedTime;
    const e = p * p * (3 - 2 * p);
    const drift = still ? 0 : (1 - e) * 0.18;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = start[i * 3] + (target[i * 3] - start[i * 3]) * e + Math.sin(t * 0.4 + i) * drift;
      pos[i * 3 + 1] = start[i * 3 + 1] + (target[i * 3 + 1] - start[i * 3 + 1]) * e + Math.cos(t * 0.35 + i * 1.3) * drift;
      pos[i * 3 + 2] = start[i * 3 + 2] + (target[i * 3 + 2] - start[i * 3 + 2]) * e;
    }
    const g = ref.current!.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} map={dot} alphaTest={0.3} vertexColors transparent opacity={0.95} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function PriceLine({ progress }: { progress: Progress }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current!.material as THREE.MeshBasicMaterial;
    m.opacity = 0.25 + progress.current * 0.55;
  });
  return (
    <mesh ref={ref} position={[0, 0, -0.1]}>
      <planeGeometry args={[22, 0.012]} />
      <meshBasicMaterial color="#e8edf3" transparent opacity={0.25} />
    </mesh>
  );
}

function CrossPoint({ progress }: { progress: Progress }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    ref.current!.scale.setScalar(0.5 + progress.current * 1.2);
  });
  return (
    <mesh ref={ref} position={[2.6, 0, 0]}>
      <ringGeometry args={[0.1, 0.13, 48]} />
      <meshBasicMaterial color="#2650ff" />
    </mesh>
  );
}

export default function HeroScene({ progress, still }: { progress: Progress; still: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 7], fov: 50 }}
      frameloop={still ? "demand" : "always"}
      gl={{ antialias: true, alpha: true }}
    >
      <PriceLine progress={progress} />
      <Orders progress={progress} still={still} />
      <CrossPoint progress={progress} />
    </Canvas>
  );
}
