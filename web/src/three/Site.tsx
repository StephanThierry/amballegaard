import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { House, P2 } from '../types'
import { getMaterials } from './materials'
import { displace, flatShape, hash3, meterBox, slabShape } from './util'

const GROUND_Y = -0.14

/** Grunden som en diorama-"kage": græs ovenpå, jordlag i siderne. */
export function Site({ house }: { house: House }) {
  const m = getMaterials()
  const [[x0, z0], [x1, z1]] = house.site.bounds
  const lawn = useMemo(() => flatShape([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], GROUND_Y), [x0, z0, x1, z1])
  const terrace = useMemo(() => slabShape(house.site.terrace, -0.06, 0.1), [house])
  const driveway = useMemo(() => slabShape(house.site.driveway, -0.07, 0.1), [house])
  const depth = 1.6

  return (
    <group>
      <mesh geometry={lawn} material={m.lawn} receiveShadow />
      <mesh material={m.soil} position={[(x0 + x1) / 2, GROUND_Y - depth / 2 - 0.001, (z0 + z1) / 2]} receiveShadow>
        <boxGeometry args={[x1 - x0, depth, z1 - z0]} />
      </mesh>
      <mesh material={m.soilDark} position={[(x0 + x1) / 2, GROUND_Y - depth - 0.05, (z0 + z1) / 2]}>
        <boxGeometry args={[x1 - x0 + 0.4, 0.1, z1 - z0 + 0.4]} />
      </mesh>
      <mesh geometry={terrace} material={m.pavers} receiveShadow />
      <mesh geometry={driveway} material={m.driveway} receiveShadow />
      {house.site.hedges.map((h, i) => <Hedge key={i} {...h} seed={i} />)}
      {house.site.retainingWalls.map((w, i) => <BlockWall key={i} {...w} />)}
      <Trees bounds={house.site.bounds} />
    </group>
  )
}

function Hedge({ a, b, height, depth, seed }: { a: P2; b: P2; height: number; depth: number; seed: number }) {
  const m = getMaterials()
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const geom = useMemo(() => {
    const g = meterBox(len, height, depth, [Math.ceil(len * 3), Math.ceil(height * 3), Math.ceil(depth * 3)])
    g.translate(seed * 13.7, 0, seed * 3.1) // forskellig støj pr. hæk
    displace(g, 0.16, 1.4)
    g.translate(-seed * 13.7, 0, -seed * 3.1)
    return g
  }, [len, height, depth, seed])
  return (
    <mesh geometry={geom} material={m.hedge} castShadow receiveShadow
      position={[(a[0] + b[0]) / 2, GROUND_Y + height / 2, (a[1] + b[1]) / 2]}
      rotation={[0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0]} />
  )
}

/** Støttemur af forskudte betonblokke (som på fotoet ved den overdækkede terrasse). */
function BlockWall({ a, b, height }: { a: P2; b: P2; height: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const m = getMaterials()
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const bl = 0.4, bh = 0.2, bd = 0.3
  const rows = Math.round(height / bh)
  const perRow = Math.ceil(len / (bl + 0.08))
  const count = rows * perRow
  const geom = useMemo(() => meterBox(bl, bh - 0.01, bd), [])

  useLayoutEffect(() => {
    const dir = new THREE.Vector3((b[0] - a[0]) / len, 0, (b[1] - a[1]) / len)
    const n = new THREE.Vector3(-dir.z, 0, dir.x)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(dir.z, dir.x))
    const mat = new THREE.Matrix4()
    let i = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < perRow; c++) {
        const s = c * (bl + 0.08) + (r % 2) * 0.24 + bl / 2
        const along = Math.min(s, len - bl / 2)
        const setback = (r % 2) * 0.08 + r * 0.03
        const p = new THREE.Vector3(a[0], GROUND_Y + r * bh + bh / 2, a[1]).addScaledVector(dir, along).addScaledVector(n, setback)
        mat.compose(p, q, new THREE.Vector3(1, 1, 1))
        ref.current!.setMatrixAt(i++, mat)
      }
    }
    ref.current!.instanceMatrix.needsUpdate = true
  }, [a, b, len, rows, perRow])

  return <instancedMesh ref={ref} args={[geom, m.blocks, count]} castShadow receiveShadow />
}

/** Løvtræer i hjørnerne af grunden — stamme + klynger af forskudte kugler. */
function Trees({ bounds }: { bounds: [P2, P2] }) {
  const m = getMaterials()
  const [[x0, z0], [x1, z1]] = bounds
  const spots: P2[] = [[x0 + 3, z1 - 3], [x1 - 2.5, z1 - 2.5], [x1 - 2.5, z0 + 2.5], [x0 + 2.5, z1 - 9], [x0 + 6, z0 + 2.2]]
  const trunk = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a4a3c', roughness: 0.95 }), [])
  const crowns = useMemo(() => spots.map((_, i) => {
    const g = new THREE.IcosahedronGeometry(1, 3)
    g.translate(i * 9.1, 0, 0)
    displace(g, 0.55, 1.6, false)
    g.translate(-i * 9.1, 0, 0)
    return g
  }), [spots.length])
  return (
    <>
      {spots.map(([x, z], i) => {
        const s = 0.8 + hash3(i, 1, 2) * 0.5
        return (
          <group key={i} position={[x, GROUND_Y, z]} scale={s}>
            <mesh material={trunk} position={[0, 1.4, 0]} castShadow><cylinderGeometry args={[0.1, 0.16, 2.8, 8]} /></mesh>
            {[[0, 3.6, 0, 1.6], [0.8, 3.1, 0.4, 1.1], [-0.7, 3.2, -0.3, 1.2], [0.2, 4.4, -0.2, 1.1]].map(([cx, cy, cz, r], k) => (
              <mesh key={k} geometry={crowns[i]} material={m.hedge} position={[cx, cy, cz]} scale={r} castShadow receiveShadow />
            ))}
          </group>
        )
      })}
    </>
  )
}
