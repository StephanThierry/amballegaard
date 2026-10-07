import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { gaitPose } from './gait'

/**
 * Voxel-hund der traver: diagonale benpar bevæger sig sammen, kroppen bobber, halen logrer.
 * `speedRef` (m/s) styrer gangen; uden den går hunden altid. Front mod +z.
 */
export function VoxelDog({ color = '#c9a26b', ear = '#a87d47', speedRef, walk = true, speedScale = 1, flailRef }: {
  color?: string; ear?: string; speedRef?: { current: number }; walk?: boolean; speedScale?: number; flailRef?: { current: boolean }
}) {
  const m = useMemo(() => ({
    fur: new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: ear, roughness: 0.9 }),
    nose: new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.4 }),
  }), [color, ear])
  const legs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const body = useRef<THREE.Group>(null), tail = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null)
  const phase = useRef(0), amt = useRef(1)
  useFrame(({ clock }, dt) => {
    const fl = !!flailRef?.current
    const target = fl ? 1 : speedRef ? Math.min(1, speedRef.current / 0.5) : walk ? 1 : 0
    amt.current += (target - amt.current) * Math.min(1, dt * 5)
    phase.current += dt * (fl ? 22 : 10) * speedScale * Math.max(0.1, amt.current)
    const p = gaitPose(phase.current, 'bouncy', amt.current)
    // Trav: forreste venstre + bageste højre sammen (legs[0], legs[3]) og omvendt.
    const a = p.legs[0].hip * 1.4, b = p.legs[1].hip * 1.4
    legs[0].current!.rotation.x = a; legs[3].current!.rotation.x = a
    legs[1].current!.rotation.x = b; legs[2].current!.rotation.x = b
    body.current!.position.y = p.bob * 0.8
    tail.current!.rotation.y = Math.sin(clock.elapsedTime * 12) * 0.6
    head.current!.rotation.x = Math.sin(phase.current * 2) * 0.05 * amt.current
  })
  const legPos: [number, number][] = [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.15], [0.07, -0.15]]
  return (
    <group ref={body}>
      <mesh material={m.fur} position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.2, 0.17, 0.46]} /></mesh>
      <group ref={head} position={[0, 0.42, 0.25]}>
        <mesh material={m.fur} castShadow><boxGeometry args={[0.17, 0.16, 0.16]} /></mesh>
        <mesh material={m.fur} position={[0, -0.03, 0.11]}><boxGeometry args={[0.1, 0.08, 0.08]} /></mesh>
        <mesh material={m.nose} position={[0, -0.01, 0.155]}><boxGeometry args={[0.04, 0.03, 0.02]} /></mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={m.dark} position={[s * 0.09, 0.0, -0.01]}><boxGeometry args={[0.03, 0.12, 0.07]} /></mesh>
            <mesh material={m.nose} position={[s * 0.045, 0.03, 0.081]}><boxGeometry args={[0.025, 0.025, 0.01]} /></mesh>
          </group>
        ))}
      </group>
      <group ref={tail} position={[0, 0.36, -0.23]} rotation={[-0.7, 0, 0]}>
        <mesh material={m.fur} position={[0, 0.07, 0]}><boxGeometry args={[0.04, 0.15, 0.04]} /></mesh>
      </group>
      {legPos.map(([x, z], i) => (
        <group key={i} ref={legs[i]} position={[x, 0.24, z]}>
          <mesh material={i < 2 ? m.fur : m.dark} position={[0, -0.12, 0]} castShadow><boxGeometry args={[0.06, 0.24, 0.06]} /></mesh>
        </group>
      ))}
    </group>
  )
}
