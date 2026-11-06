"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Progress = React.MutableRefObject<number>;

const N = 30; // orders
const P_STAR = 1.5; // height of the reference price
const CROSS_X = 2.4;
const SEG = 160;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The pool's price as a ribbon. It sits at Friday's close, then bends up to the cross price in the gap auction. */
function Pool({ progress }: { progress: Progress }) {
  const geo = useRef<THREE.BufferGeometry>(null);
  const arr = useMemo(() => new Float32Array((SEG + 1) * 2 * 3), []);
  const idx = useMemo(() => {
    const i: number[] = [];
    for (let s = 0; s < SEG; s++) {
      const a = s * 2;
      i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return i;
  }, []);

  useFrame(() => {
    const bend = sstep(0.76, 0.98, progress.current);
    for (let s = 0; s <= SEG; s++) {
      const u = s / SEG;
      const x = -8 + u * 16;
      const rise = P_STAR * bend * sstep(0.35, 0.7, u);
      arr.set([x, rise + 0.018, 0, x, rise - 0.018, 0], s * 6);
    }
    const g = geo.current!;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <mesh frustumCulled={false}>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[arr, 3]} />
        <bufferAttribute attach="index" args={[new Uint16Array(idx), 1]} />
      </bufferGeometry>
      <meshBasicMaterial color="#e8edf3" side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Orders as small blocks: they arrive while the market is dark, wait in the queue, then fly to one price. */
function Orders({ progress }: { progress: Progress }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const plan = useMemo(() => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: N }, (_, i) => {
      const buy = i % 2 === 0;
      const col = Math.floor(i / 2) % 8;
      const row = Math.floor(i / 16);
      return {
        buy,
        spawn: [-10 - rnd() * 3, (buy ? 1 : -1) * (0.9 + rnd() * 2.4), (rnd() - 0.5) * 3] as const,
        queue: [-3.9 + col * 0.36, (buy ? 1 : -1) * (0.55 + row * 0.34), (rnd() - 0.5) * 0.4] as const,
        jitter: [(rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.35] as const,
        at: 0.2 + (i / N) * 0.22,
        size: 0.14 + rnd() * 0.1,
      };
    });
  }, []);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    plan.forEach((o, i) => ref.current!.setColorAt(i, c.set(o.buy ? "#6f95ff" : "#eef2fa")));
    ref.current!.instanceColor!.needsUpdate = true;
  }, [plan]);

  useFrame(() => {
    const p = progress.current;
    const arrive = (o: (typeof plan)[number]) => sstep(o.at, o.at + 0.16, p);
    const cross = sstep(0.52, 0.68, p);
    const gone = sstep(0.68, 0.78, p);
    plan.forEach((o, i) => {
      const a = arrive(o);
      const x = o.spawn[0] + (o.queue[0] - o.spawn[0]) * a;
      const y = o.spawn[1] + (o.queue[1] - o.spawn[1]) * a;
      const z = o.spawn[2] + (o.queue[2] - o.spawn[2]) * a;
      const fx = x + (CROSS_X + o.jitter[0] - x) * cross;
      const fy = y + (P_STAR + o.jitter[1] - y) * cross;
      const fz = z + (o.jitter[2] - z) * cross;
      dummy.position.set(fx, fy, fz);
      dummy.rotation.set(p * 4 * (i % 3), p * 3, 0);
      const s = o.size * (a > 0.01 ? 1 : 0) * (1 - gone);
      dummy.scale.setScalar(Math.max(s, 0.0001));
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}

/** The cross: a ring that opens at the reference price and sends the surplus down to the pool. */
function Cross({ progress }: { progress: Progress }) {
  const ring = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const D = 16;

  useFrame(({ clock }) => {
    const p = progress.current;
    const open = sstep(0.5, 0.66, p);
    ring.current!.scale.setScalar(0.2 + open * 1.05);
    (ring.current!.material as THREE.MeshBasicMaterial).opacity = open * (1 - sstep(0.9, 1, p) * 0.7);
    const f = Math.max(0, 1 - Math.abs(p - 0.64) / 0.05);
    flash.current!.scale.setScalar(0.3 + f * 2.4);
    (flash.current!.material as THREE.MeshBasicMaterial).opacity = f * 0.55;

    // surplus falling to the pool, after the cross
    const t = clock.elapsedTime;
    for (let i = 0; i < D; i++) {
      const phase = (i / D + (t * 0.35) % 1) % 1;
      const on = sstep(0.68, 0.74, p) * (1 - sstep(0.9, 0.97, p));
      const poolY = P_STAR * sstep(0.76, 0.98, p) * sstep(0.35, 0.7, (CROSS_X + 8) / 16);
      const y = P_STAR - phase * (P_STAR - poolY + 0.05);
      dummy.position.set(Math.sin(i * 2.1) * 0.5, y, Math.cos(i * 1.7) * 0.4);
      dummy.scale.setScalar(0.07 * on * (1 - phase * 0.4));
      dummy.updateMatrix();
      drops.current!.setMatrixAt(i, dummy.matrix);
    }
    drops.current!.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[CROSS_X, P_STAR, 0]}>
      <mesh ref={ring}>
        <torusGeometry args={[0.8, 0.018, 8, 96]} />
        <meshBasicMaterial color="#2650ff" transparent opacity={0} />
      </mesh>
      <mesh ref={flash}>
        <circleGeometry args={[0.7, 48]} />
        <meshBasicMaterial color="#8fa8ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <instancedMesh ref={drops} args={[undefined, undefined, D]} position={[0, -P_STAR, 0]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="#12a072" />
      </instancedMesh>
    </group>
  );
}

/** The reference price, once it is back. */
function RefLine({ progress }: { progress: Progress }) {
  const m = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    m.current!.opacity = sstep(0.46, 0.56, progress.current) * 0.7;
  });
  return (
    <mesh position={[0, P_STAR, -0.3]}>
      <planeGeometry args={[22, 0.016]} />
      <meshBasicMaterial ref={m} color="#2650ff" transparent opacity={0} />
    </mesh>
  );
}

/** The dark veil: while the market is closed the scene is dimmed, and it lifts at the cross. */
function Veil({ progress }: { progress: Progress }) {
  const m = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const p = progress.current;
    m.current!.opacity = sstep(0.04, 0.18, p) * 0.5 * (1 - sstep(0.5, 0.64, p));
  });
  return (
    <mesh position={[0, 0, 2.5]}>
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial ref={m} color="#050b18" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** The auction's fee, as a bar that starts tall and shrinks every block. */
function FeeBar({ progress }: { progress: Progress }) {
  const bar = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const p = progress.current;
    const on = sstep(0.76, 0.82, p);
    const h = 1.8 * (1 - sstep(0.8, 1, p) * 0.9);
    bar.current!.scale.set(1, Math.max(h * on, 0.001), 1);
    bar.current!.position.y = -2.7 + (h * on) / 2;
  });
  return (
    <mesh ref={bar} position={[5.4, -2.7, 0]}>
      <boxGeometry args={[0.28, 1, 0.12]} />
      <meshBasicMaterial color="#c97a00" />
    </mesh>
  );
}

function Rig({ progress, narrow }: { progress: Progress; narrow: boolean }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    const p = progress.current;
    const sway = Math.sin(p * Math.PI * 2) * 1.1;
    camera.position.x += (sway + pointer.x * 0.5 - camera.position.x) * 0.06;
    camera.position.y += (0.4 + pointer.y * 0.3 - camera.position.y) * 0.06;
    camera.position.z = (narrow ? 13 : 10) - sstep(0.5, 0.66, p) * 1.2 + sstep(0.76, 1, p) * 0.8;
    camera.lookAt(narrow ? 0 : -0.6, 0.45, 0);
  });
  return null;
}

function World({ progress }: { progress: Progress }) {
  const { size } = useThree();
  const narrow = size.width < 768;
  return (
    <>
      <Rig progress={progress} narrow={narrow} />
      <group position={[narrow ? 0 : 0.35, narrow ? -0.4 : -0.2, 0]} scale={narrow ? 0.6 : 0.8}>
        <Veil progress={progress} />
        <Pool progress={progress} />
        <RefLine progress={progress} />
        <Orders progress={progress} />
        <Cross progress={progress} />
        <FeeBar progress={progress} />
      </group>
    </>
  );
}

export default function CrossScene({ progress, still }: { progress: Progress; still: boolean }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.4, 10], fov: 46 }} frameloop={still ? "demand" : "always"} gl={{ antialias: true, alpha: true }}>
      <World progress={progress} />
    </Canvas>
  );
}
