import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { toggleMower, useStore } from '../store'
import { WallSwitch } from './Openings'

/** Ladestationens placering (skal matche Mower.Dock i simulationen) og væggen bag den. */
const DOCK = { x: 19.35, z: 17.6, wallX: 19.9 }
/** Terrassens vestkant: øst for den kører klipperen på fliser, vest for den på græsset (lidt lavere). */
const TERRACE_EDGE_X = 12.46
const TERRACE_Y = -0.055, LAWN_Y = -0.14

const mats = (() => {
  let c: ReturnType<typeof make> | null = null
  function make() {
    const s = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
    return {
      shell: s({ color: '#e9eaeb', roughness: 0.35 }),
      lid: s({ color: '#2b2e33', roughness: 0.3, metalness: 0.2 }),
      dark: s({ color: '#17181a', roughness: 0.6 }),
      tyre: s({ color: '#1b1b1b', roughness: 0.9 }),
      hub: s({ color: '#9aa0a6', roughness: 0.4, metalness: 0.5 }),
      lidar: s({ color: '#101114', roughness: 0.15, metalness: 0.3 }),
      accent: s({ color: '#c7cbd0', roughness: 0.3, metalness: 0.6 }),
      led: s({ color: '#0a0a0a', emissive: '#4fd1ff', emissiveIntensity: 1.8, toneMapped: false }),
      charge: s({ color: '#0a0a0a', emissive: '#5fe08a', emissiveIntensity: 0, toneMapped: false }),
    }
  }
  return () => (c ??= make())
})()

export function MowerAndDock() {
  const on = useStore((s) => s.snapshot?.mower?.on ?? true)
  return (
    <group>
      <Dock />
      <RobotMower />
      <group position={[DOCK.wallX - 0.007, 1.1, DOCK.z]} rotation={[0, -Math.PI / 2, 0]}>
        <WallSwitch position={[0, 0, 0]} on={on} onToggle={() => toggleMower()} />
      </group>
    </group>
  )
}

/** Dreame A2-lignende robotklipper: lys skal med mørkt låg, LiDAR-kuppel foran, store baghjul. Front mod +z. */
function RobotMower() {
  const m = mats()
  const root = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group[]>([])
  const st = useRef({ init: false, pos: new THREE.Vector3(), heading: 0, roll: 0 })
  useFrame((_, dt) => {
    const s = useStore.getState().snapshot?.mower
    const g = root.current
    if (!s || !g) return
    const v = st.current
    const yAt = (x: number) => THREE.MathUtils.lerp(LAWN_Y, TERRACE_Y, THREE.MathUtils.smoothstep(x, TERRACE_EDGE_X - 0.15, TERRACE_EDGE_X + 0.15))
    const target = new THREE.Vector3(s.x, yAt(s.x), s.z)
    if (!v.init) { v.pos.copy(target); v.heading = s.heading; v.init = true }
    const before = v.pos.clone()
    v.pos.lerp(target, 1 - Math.exp(-dt * 4))
    let dh = s.heading - v.heading
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    v.heading += dh * Math.min(1, dt * 5)
    v.roll += before.distanceTo(v.pos) / 0.11
    g.position.copy(v.pos)
    g.rotation.y = v.heading
    wheels.current.forEach((w) => { if (w) w.rotation.x = v.roll })
    m.charge.emissiveIntensity = s.state === 'charging' ? 1.5 + Math.sin(performance.now() / 400) : 0
  })
  return (
    <group ref={root}>
      {/* Underkrop og skal */}
      <RoundedBox args={[0.46, 0.12, 0.66]} radius={0.05} smoothness={4} position={[0, 0.13, 0]} material={m.dark} castShadow />
      <RoundedBox args={[0.5, 0.14, 0.7]} radius={0.07} smoothness={5} position={[0, 0.2, -0.01]} material={m.shell} castShadow receiveShadow />
      {/* Mørkt toplåg med lille stopknap */}
      <RoundedBox args={[0.4, 0.04, 0.42]} radius={0.02} smoothness={3} position={[0, 0.275, -0.06]} material={m.lid} castShadow />
      <mesh material={m.accent} position={[0, 0.3, -0.12]}><cylinderGeometry args={[0.035, 0.035, 0.012, 20]} /></mesh>
      {/* LiDAR-kuppel foran */}
      <group position={[0, 0.3, 0.2]}>
        <mesh material={m.shell} castShadow><cylinderGeometry args={[0.07, 0.08, 0.05, 24]} /></mesh>
        <mesh material={m.lidar} position={[0, 0.04, 0]}><cylinderGeometry args={[0.055, 0.06, 0.035, 24]} /></mesh>
        <mesh material={m.shell} position={[0, 0.065, 0]}><cylinderGeometry args={[0.065, 0.065, 0.012, 24]} /></mesh>
        <mesh material={m.led} position={[0, 0.0, 0.081]}><boxGeometry args={[0.05, 0.008, 0.004]} /></mesh>
      </group>
      {/* Kofanger foran */}
      <RoundedBox args={[0.48, 0.07, 0.05]} radius={0.02} smoothness={3} position={[0, 0.12, 0.34]} material={m.accent} />
      {/* Store baghjul, små forhjul */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.26, 0.11, -0.18]} ref={(g) => { if (g) wheels.current[s === -1 ? 0 : 1] = g }}>
          <mesh material={m.tyre} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.11, 0.11, 0.07, 24]} /></mesh>
          <mesh material={m.hub} position={[s * 0.036, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.05, 0.05, 0.005, 16]} /></mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`f${s}`} material={m.tyre} position={[s * 0.17, 0.045, 0.24]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.045, 0.045, 0.04, 16]} /></mesh>
      ))}
      {/* Ladeindikator */}
      <mesh material={m.charge} position={[0, 0.278, 0.12]}><boxGeometry args={[0.08, 0.004, 0.012]} /></mesh>
    </group>
  )
}

/** Ladestation: bundplade med rampe og ladekontakter, og en søjle mod væggen med antenne. Klipperen parkerer med fronten mod -x. */
function Dock() {
  const m = mats()
  const ramp = useMemo(() => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.18, 0), new THREE.Vector2(0.18, 0.03), new THREE.Vector2(0, 0.005)])
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.56, bevelEnabled: false })
    g.translate(0, 0, -0.28)
    return g
  }, [])
  return (
    <group position={[DOCK.x, TERRACE_Y, DOCK.z]}>
      {/* Bundplade under klipperen + rampe ud mod -x */}
      <mesh material={m.dark} position={[0.08, 0.015, 0]} receiveShadow><boxGeometry args={[0.72, 0.03, 0.56]} /></mesh>
      <mesh geometry={ramp} material={m.dark} position={[-0.28, 0, 0]} rotation={[0, Math.PI, 0]} />
      {/* Søjle mod væggen */}
      <RoundedBox args={[0.12, 0.3, 0.4]} radius={0.03} smoothness={3} position={[0.46, 0.16, 0]} material={m.shell} castShadow />
      <RoundedBox args={[0.06, 0.12, 0.3]} radius={0.02} smoothness={3} position={[0.4, 0.1, 0]} material={m.lid} />
      {/* Ladekontakter */}
      {[-0.08, 0.08].map((z) => <mesh key={z} material={m.accent} position={[0.37, 0.09, z]}><boxGeometry args={[0.01, 0.03, 0.05]} /></mesh>)}
      {/* RTK-antenne */}
      <mesh material={m.dark} position={[0.46, 0.45, 0]}><cylinderGeometry args={[0.012, 0.012, 0.3, 10]} /></mesh>
      <mesh material={m.shell} position={[0.46, 0.62, 0]} castShadow><cylinderGeometry args={[0.06, 0.06, 0.04, 20]} /></mesh>
    </group>
  )
}
