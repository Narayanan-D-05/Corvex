"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CROSS, P_STAR, at, orderAt, weekend, type WeekendScenario } from "@/lib/weekend";

type Ref = React.MutableRefObject<number>;

const X = (t: number) => -6.5 + 13 * t;
const Y = (p: number) => (p - 200) * 0.5 - 0.8;
const LANE = { noHook: -2.2, corvex: 0, fair: 2.2 };
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const FAIR_DEFAULT = [[0, 200], [CROSS - 0.005, 200], [CROSS + 0.005, 212], [1, 212]] as const;

/** A curve that is parameterised by time, so drawing the first part of a tube is the same as playing the weekend. */
class TimeCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private f: (t: number) => THREE.Vector3) {
    super();
  }
  getPoint(u: number, target = new THREE.Vector3()) {
    return target.copy(this.f(u));
  }
  getPointAt(u: number, target = new THREE.Vector3()) {
    return this.getPoint(u, target);
  }
}

const SEG = 240;
const RADIAL = 8;

function Line({ keys, z, color, tRef, from = 0, to = 1, r = 0.1 }: { keys: WeekendScenario["noHook"]; z: number; color: string; tRef: Ref; from?: number; to?: number; r?: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const curve = new TimeCurve((u) => {
      const t = from + (to - from) * u;
      return new THREE.Vector3(X(t), Y(at(keys, t)), z);
    });
    return new THREE.TubeGeometry(curve, SEG, r, RADIAL, false);
  }, [keys, z, from, to, r]);

  useFrame(() => {
    const t = tRef.current;
    const frac = clamp((t - from) / (to - from));
    mesh.current!.geometry.setDrawRange(0, Math.floor(frac * SEG) * RADIAL * 6);
    const tt = Math.min(Math.max(t, from), to);
    head.current!.position.set(X(tt), Y(at(keys, tt)), z);
    head.current!.visible = t > from + 0.002 && t < to + 0.02;
  });

  return (
    <>
      <mesh ref={mesh} geometry={geo} frustumCulled={false}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.4} />
      </mesh>
      <mesh ref={head}>
        <sphereGeometry args={[r * 2.6, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </>
  );
}

/** The Chainlink price: dashed and grey while the feed is dark, solid blue once it is back. */
function Fair({ tRef, keys, dark }: { tRef: Ref; keys: WeekendScenario["noHook"]; dark: number }) {
  const D = 34;
  const dashes = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const t = tRef.current;
    for (let i = 0; i < D; i++) {
      const ti = ((i + 0.5) / D) * dark;
      dummy.position.set(X(ti), Y(at(keys, ti)), LANE.fair);
      dummy.scale.setScalar(dark > 0 && t > ti ? 1 : 0.0001);
      dummy.updateMatrix();
      dashes.current!.setMatrixAt(i, dummy.matrix);
    }
    dashes.current!.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={dashes} args={[undefined, undefined, D]} frustumCulled={false}>
        <boxGeometry args={[0.26, 0.07, 0.07]} />
        <meshBasicMaterial color="#8794ad" />
      </instancedMesh>
      <Line keys={keys} z={LANE.fair} color="#6f95ff" tRef={tRef} from={Math.max(0, dark - 0.005)} to={1} r={0.1} />
    </>
  );
}

/** The 2% corridor around Friday's close, as a glass box that the Corvex lane runs through. */
function Band({ tRef, until }: { tRef: Ref; until: number }) {
  const w = X(until) - X(0);
  const h = Y(200 * 1.02) - Y(200 * 0.98);
  const box = useMemo(() => new THREE.BoxGeometry(w, h, 1.9), [w, h]);
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  useFrame(() => {
    const k = 1 - sstep(CROSS - 0.02, CROSS + 0.08, tRef.current) * 0.7;
    fill.current!.opacity = 0.1 * k;
    edge.current!.opacity = 0.6 * k;
  });
  return (
    <group position={[(X(0) + X(until)) / 2, Y(200), 0]}>
      <mesh geometry={box}>
        <meshBasicMaterial ref={fill} color="#2650ff" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial ref={edge} color="#8fa8ff" transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

/** Queued orders as blocks at their limit prices. At the cross they slide to one price: filled turn green, refunded fade. */
function Orders({ tRef, list, pStar }: { tRef: Ref; list: WeekendScenario["orders"]; pStar: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const n = Math.max(1, list.length);

  useLayoutEffect(() => {
    for (let i = 0; i < n; i++) ref.current!.setColorAt(i, col.set("#ffffff"));
    ref.current!.instanceColor!.needsUpdate = true;
  }, [n, col]);

  useFrame(({ clock }) => {
    const t = tRef.current;
    list.forEach((o, i) => {
      const p = orderAt(o, t, pStar);
      const pop = p.shown ? sstep(o.at, o.at + 0.03, t) : 0;
      const gone = o.kind === "refunded" ? sstep(0.06, 0.9, p.slide) : 0;
      const bob = Math.sin(clock.elapsedTime * 1.6 + i) * 0.05;
      dummy.position.set(X(p.time), Y(p.price) + bob, (i % 2 ? 0.35 : -0.35) * (1 - p.slide));
      dummy.rotation.set(0.3 + clock.elapsedTime * 0.3, 0.5 + i, 0);
      dummy.scale.setScalar(Math.max(0.0001, (0.34 + (o.usd / 5000) * 0.3) * pop * (1 - gone)));
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      const base = o.side === "buy" ? "#7ea0ff" : "#f2f5fb";
      col.set(base).lerp(new THREE.Color(o.kind === "filled" ? "#2ee6a0" : "#e0a030"), sstep(0, 0.4, p.slide));
      ref.current!.setColorAt(i, col);
    });
    if (list.length === 0) {
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(0, dummy.matrix);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.instanceColor!.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.3} metalness={0.1} emissiveIntensity={0.25} emissive="#335" />
    </instancedMesh>
  );
}

/** The cross: a ring the Corvex line passes through, with a flash when it fires. */
function CrossRing({ tRef, pStar }: { tRef: Ref; pStar: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = tRef.current;
    const open = sstep(CROSS - 0.03, CROSS + 0.02, t);
    const f = Math.max(0, 1 - Math.abs(t - (CROSS + 0.01)) / 0.035);
    ring.current!.scale.setScalar(0.05 + open * 1);
    ring.current!.rotation.x = clock.elapsedTime * 0.5;
    inner.current!.scale.setScalar(0.05 + open * 0.72);
    inner.current!.rotation.x = -clock.elapsedTime * 0.8;
    flash.current!.scale.setScalar(0.2 + f * 3.4);
    (flash.current!.material as THREE.MeshBasicMaterial).opacity = f * 0.55;
  });
  return (
    <group position={[X(0.9), Y(pStar), 0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh ref={ring}>
        <torusGeometry args={[2.1, 0.05, 10, 120]} />
        <meshBasicMaterial color="#4d73ff" />
      </mesh>
      <mesh ref={inner}>
        <torusGeometry args={[1.5, 0.028, 8, 96]} />
        <meshBasicMaterial color="#b6c6ff" />
      </mesh>
      <mesh ref={flash}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial color="#8fa8ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** A glowing plane that sweeps along the weekend. */
function Playhead({ tRef }: { tRef: Ref }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = tRef.current;
    m.current!.position.x = X(t);
    (m.current!.material as THREE.MeshBasicMaterial).opacity = 0.1 * (t > 0.005 && t < 0.995 ? 1 : 0);
  });
  return (
    <mesh ref={m} position={[X(0), 1.6, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[7, 8]} />
      <meshBasicMaterial color="#8fa8ff" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Dust() {
  const N = 260;
  const ref = useRef<THREE.Points>(null);
  const { base, tex } = useMemo(() => {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) base.set([(rnd() - 0.5) * 34, rnd() * 9 - 2, (rnd() - 0.5) * 22], i * 3);
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return { base, tex: new THREE.CanvasTexture(c) };
  }, []);
  const pos = useMemo(() => new Float32Array(base), [base]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.3 + i) * 0.25;
      pos[i * 3] = base[i * 3] + Math.cos(t * 0.2 + i * 0.7) * 0.2;
    }
    (ref.current!.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} map={tex} color="#9db4ff" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Driver({ tRef, progress, mode, still }: { tRef: Ref; progress: Ref; mode: "loop" | "scrub"; still: boolean }) {
  useFrame(({ clock }) => {
    if (still) {
      tRef.current = 1;
      return;
    }
    if (mode === "scrub") {
      tRef.current = progress.current;
      return;
    }
    const phase = (clock.elapsedTime % 22) / 22;
    tRef.current = phase < 0.78 ? phase / 0.78 : phase < 0.94 ? 1 : 1 - sstep(0.94, 1, phase);
  });
  return null;
}

function Rig({ progress, mode, still, focus }: { progress: Ref; mode: "loop" | "scrub"; still: boolean; focus: number }) {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const p = progress.current;
    const s = clock.elapsedTime;
    let angle: number, radius: number, height: number;
    if (mode === "loop") {
      angle = still ? -0.25 : Math.sin(s * 0.16) * 0.38 - 0.2;
      radius = 14 - p * 3;
      height = 3.6 - p * 1.2;
    } else {
      angle = 0.55 - p * 0.9;
      radius = 10 - sstep(0.7, 1, p) * 1.4;
      height = 3.2 - p * 0.8;
    }
    const px = still ? 0 : pointer.x * 0.7;
    const py = still ? 0 : pointer.y * 0.35;
    target.set(Math.sin(angle) * radius + px, height + py, Math.cos(angle) * radius);
    camera.position.lerp(target, 0.07);
    camera.lookAt(0, focus, 0);
  });
  return null;
}

function World({ progress, mode, still, scenario }: { progress: Ref; mode: "loop" | "scrub"; still: boolean; scenario: WeekendScenario }) {
  const tRef = useRef(0);
  const { size } = useThree();
  const narrow = size.width < 768;
  const hero = mode === "loop";
  const dark = scenario.darkUntil ?? CROSS;
  const pStar = scenario.pStar ?? P_STAR;
  const pos: [number, number, number] = hero ? (narrow ? [0, 2.4, 0] : [4.6, 0.6, 0]) : [0, narrow ? 0.2 : 0, 0];
  const scale = (hero ? (narrow ? 0.42 : 0.6) : narrow ? 0.5 : 0.72) * (dark > 0 ? 1 : 1.45);
  return (
    <>
      <color attach="background" args={["#0b1730"]} />
      <fog attach="fog" args={["#0b1730", 14, 42]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <Driver tRef={tRef} progress={progress} mode={mode} still={still} />
      <Rig progress={progress} mode={mode} still={still} focus={dark > 0 ? 1.4 : 0.1} />
      <gridHelper args={[60, 60, "#2650ff", "#142852"]} position={[0, -3.4, 0]} />
      <Dust />
      <group position={pos} scale={scale}>
        {dark > 0 && <Band tRef={tRef} until={dark - 0.005} />}
        <Playhead tRef={tRef} />
        <Line keys={scenario.noHook} z={LANE.noHook} color="#ff8a73" tRef={tRef} />
        <Line keys={scenario.corvex} z={LANE.corvex} color="#eef2fa" tRef={tRef} r={0.13} />
        <Fair tRef={tRef} keys={scenario.fair ?? FAIR_DEFAULT} dark={dark} />
        <Orders tRef={tRef} list={scenario.orders} pStar={pStar} />
        {dark > 0 && <CrossRing tRef={tRef} pStar={pStar} />}
      </group>
    </>
  );
}

export default function WeekendScene({ progress, mode, still, scenario = weekend }: { progress: Ref; mode: "loop" | "scrub"; still: boolean; scenario?: WeekendScenario }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [-3, 4, 13], fov: mode === "loop" ? 48 : 44 }} frameloop={still ? "demand" : "always"} gl={{ antialias: true }}>
      <World progress={progress} mode={mode} still={still} scenario={scenario} />
    </Canvas>
  );
}
