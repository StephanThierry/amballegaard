import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { setObstacles, useStore } from '../store'

/**
 * Måler møblernes faktiske fodaftryk (også glTF-modeller, som serveren ikke kender størrelsen på) og sender
 * dem til serveren, så beboernes rutefinding går uden om dem. Kun ting der står på gulvet tæller —
 * tæpper, kabler og ting på borde/vægge ignoreres. Gensendes når møblerne ændrer sig (fx hot reload).
 */
export function ObstacleReporter() {
  const scene = useThree((s) => s.scene)
  const last = useRef('')
  const nextCheck = useRef(1.5)
  const box = useRef(new THREE.Box3())

  useFrame(({ clock }) => {
    if (clock.elapsedTime < nextCheck.current) return
    nextCheck.current = clock.elapsedTime + 3
    if (!useStore.getState().connected) return

    const rects: { id: string; x0: number; z0: number; x1: number; z1: number }[] = []
    scene.traverse((o) => {
      const id = o.userData?.furnitureId as string | undefined
      if (!id) return
      const b = staticBox(o, box.current)
      if (b.isEmpty()) return
      const touchesFloor = b.min.y < 0.3
      const tallEnough = b.max.y > 0.12
      if (!touchesFloor || !tallEnough) return
      rects.push({ id, x0: round(b.min.x), z0: round(b.min.z), x1: round(b.max.x), z1: round(b.max.z) })
    })
    const key = JSON.stringify(rects)
    if (key === last.current || rects.length === 0) return
    last.current = key
    setObstacles(rects)
    if (import.meta.env.DEV) (window as unknown as { __obstacles: unknown }).__obstacles = rects
  })
  return null
}

const tmp = new THREE.Box3()

/** Bounding box af objektet uden bevægelige dele (userData.dynamic), så en åben køleskabslåge ikke spærrer vejen. */
function staticBox(root: THREE.Object3D, out: THREE.Box3) {
  out.makeEmpty()
  root.updateWorldMatrix(true, true)
  const visit = (o: THREE.Object3D) => {
    if (o !== root && o.userData?.dynamic) return
    const g = (o as THREE.Mesh).geometry
    if ((o as THREE.Mesh).isMesh && g) {
      if (!g.boundingBox) g.computeBoundingBox()
      out.union(tmp.copy(g.boundingBox!).applyMatrix4(o.matrixWorld))
    }
    o.children.forEach(visit)
  }
  visit(root)
  return out
}

const round = (v: number) => Math.round(v * 100) / 100
