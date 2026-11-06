"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const COUNT = 900;
const RING_X = 4.7;
const RING_R = 1.7;

type Progress = React.MutableRefObject<number>;

function softDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Orders drift toward the camera through a deep lane, then pull into a ring at the open as you scroll. */
function Orders({ progress, still }: { progress: Progress; still: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { start, target, colors, speed } = useMemo(() => {
    const start = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const speed = new Float32Array(COUNT);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COUNT; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 2.2 + rnd() * 7.5;
      start.set([Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.62, -30 + rnd() * 34], i * 3);
      const ta = rnd() * Math.PI * 2;
      const tr = RING_R * (0.9 + rnd() * 0.22);
      target.set([RING_X + Math.cos(ta) * tr, Math.sin(ta) * tr, (rnd() - 0.5) * 0.5], i * 3);
      const buy = i % 2 === 0;
      const k = 0.65 + rnd() * 0.35;
      (buy ? [0.5, 0.65, 1.0] : [0.9, 0.94, 1.0]).forEach((c, j) => (colors[i * 3 + j] = c * k));
      speed[i] = 0.6 + rnd() * 0.8;
    }
    return { start, target, colors, speed };
  }, []);
  const pos = useMemo(() => new Float32Array(start), [start]);
  const dot = useMemo(() => softDot(), []);

  useFrame(({ clock }) => {
    const t = still ? 0 : clock.elapsedTime;
    const p = still ? 1 : progress.current;
    const e = p * p * (3 - 2 * p);
    for (let i = 0; i < COUNT; i++) {
      // the lane scrolls toward the viewer and wraps, so the crowd never runs out
      let z = start[i * 3 + 2] + ((t * speed[i] * 1.1) % 34);
      if (z > 4) z -= 34;
      const k = e;
      pos[i * 3] = start[i * 3] + (target[i * 3] - start[i * 3]) * k;
      pos[i * 3 + 1] = start[i * 3 + 1] + (target[i * 3 + 1] - start[i * 3 + 1]) * k;
      pos[i * 3 + 2] = z + (target[i * 3 + 2] - z) * k;
    }
    (ref.current!.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.2} map={dot} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/** The reference price, a thin plane through the scene that brightens as the cross nears. */
function PriceLine({ progress }: { progress: Progress }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    mat.current!.opacity = 0.22 + progress.current * 0.6;
  });
  return (
    <mesh position={[0, 0, -0.2]}>
      <planeGeometry args={[60, 0.014]} />
      <meshBasicMaterial ref={mat} color="#e8edf3" transparent opacity={0.25} />
    </mesh>
  );
}

function CrossRing({ progress, still }: { progress: Progress; still: boolean }) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const p = still ? 1 : progress.current;
    const t = still ? 0 : clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 2.2) * 0.03 * (0.4 + p);
    outer.current!.scale.setScalar((0.8 + p * 0.45) * pulse);
    outer.current!.rotation.z = t * 0.15;
    inner.current!.scale.setScalar((0.55 + p * 0.5) / pulse);
    inner.current!.rotation.z = -t * 0.25;
    (inner.current!.material as THREE.MeshBasicMaterial).opacity = 0.25 + p * 0.55;
  });
  return (
    <group position={[RING_X, 0, 0]}>
      <mesh ref={outer}>
        <torusGeometry args={[RING_R, 0.014, 8, 128]} />
        <meshBasicMaterial color="#2650ff" />
      </mesh>
      <mesh ref={inner}>
        <torusGeometry args={[RING_R * 0.7, 0.008, 8, 96]} />
        <meshBasicMaterial color="#8fa8ff" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

/** A receding grid under the lane: the floor the orders travel over. */
function Floor() {
  return <gridHelper args={[90, 90, "#2650ff", "#13264a"]} position={[0, -3.4, -12]} />;
}

function Rig({ progress, still }: { progress: Progress; still: boolean }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    const p = still ? 0 : progress.current;
    const px = still ? 0 : pointer.x;
    const py = still ? 0 : pointer.y;
    camera.position.x += (px * 0.7 - camera.position.x) * 0.05;
    camera.position.y += (py * 0.4 + 0.2 - camera.position.y) * 0.05;
    camera.position.z = 7.5 - p * 3.2;
    camera.lookAt(RING_X * 0.38, 0, 0);
  });
  return null;
}

export default function HeroScene({ progress, still }: { progress: Progress; still: boolean }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.2, 7.5], fov: 52 }} frameloop={still ? "demand" : "always"} gl={{ antialias: true, alpha: true }}>
      <fog attach="fog" args={["#0b1730", 9, 34]} />
      <Floor />
      <PriceLine progress={progress} />
      <Orders progress={progress} still={still} />
      <CrossRing progress={progress} still={still} />
      <Rig progress={progress} still={still} />
    </Canvas>
  );
}
