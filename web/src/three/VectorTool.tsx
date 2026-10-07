import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import type { House, P2, VectorRec } from '../types'
import { setControlsEnabled } from './camera'
import { furnitureItems } from './Furniture'
import { layoutWalls, pointInPolygon } from './layout'

const round = (v: number) => Math.round(v * 100) / 100
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/** Finder møbel-id ved at gå op gennem objektets forældre (Furniture sætter userData.furnitureId). */
function furnitureIdOf(o: THREE.Object3D | null): string | undefined {
  for (let cur = o; cur; cur = cur.parent) {
    const id = cur.userData?.furnitureId as string | undefined
    if (id) return id
  }
  return undefined
}

/** pointerdown-handler til scenens rodgruppe: starter en vektor når vektorværktøjet er aktivt. */
export function useVectorPointerDown() {
  return (e: ThreeEvent<PointerEvent>) => {
    const st = useStore.getState()
    if (st.tool !== 'vector' || e.button !== 0) return
    e.stopPropagation()
    setControlsEnabled(false)
    // Start der hvor musestrålen rammer gulvet (y=0), præcis som slutpunktet — ikke på møblets overflade,
    // som i isometrisk visning ligger forskudt i forhold til markøren.
    const ground = e.ray.intersectPlane(groundPlane, new THREE.Vector3()) ?? e.point
    const start: P2 = [round(ground.x), round(ground.z)]
    const n = (st.vectors.at(-1)?.n ?? 0) + 1
    st.set({ vectorDraft: { n, start, end: start, startItemId: furnitureIdOf(e.object) } })

    const up = () => {
      window.removeEventListener('pointerup', up)
      setControlsEnabled(true)
      const s = useStore.getState()
      const draft = s.vectorDraft
      if (!draft) return
      const len = Math.hypot(draft.end[0] - draft.start[0], draft.end[1] - draft.start[1])
      if (len < 0.05) {
        s.set({ vectorDraft: null })
        return
      }
      s.set({ vectors: [...s.vectors, draft], vectorDraft: null })
      if (s.house) navigator.clipboard?.writeText(vectorText(draft, s.house)).catch(() => {})
    }
    window.addEventListener('pointerup', up)
  }
}

/** Opdaterer kladdens slutpunkt (skæring med gulvplanet) og tegner alle vektorer som pile. */
export function VectorLayer() {
  const vectors = useStore((s) => s.vectors)
  const draft = useStore((s) => s.vectorDraft)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const hit = useRef(new THREE.Vector3())

  useFrame((frame) => {
    const st = useStore.getState()
    if (!st.vectorDraft) return
    raycaster.setFromCamera(frame.pointer, frame.camera)
    if (!raycaster.ray.intersectPlane(plane, hit.current)) return
    const end: P2 = [round(hit.current.x), round(hit.current.z)]
    const d = st.vectorDraft
    if (end[0] !== d.end[0] || end[1] !== d.end[1]) st.set({ vectorDraft: { ...d, end } })
  })

  return (
    <group>
      {vectors.map((v) => <Arrow key={v.n} v={v} color="#ff7a1a" />)}
      {draft && <Arrow v={draft} color="#ffb000" />}
    </group>
  )
}

function Arrow({ v, color }: { v: VectorRec; color: string }) {
  const dx = v.end[0] - v.start[0], dz = v.end[1] - v.start[1]
  const len = Math.hypot(dx, dz)
  const angle = Math.atan2(dx, dz)
  const head = Math.min(0.3, len * 0.4)
  const y = 0.08
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }), [color])
  return (
    <group renderOrder={10}>
      <mesh material={mat} position={[v.start[0], y, v.start[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <ringGeometry args={[0.1, 0.16, 28]} />
      </mesh>
      {len > 0.05 && (
        <group position={[v.start[0], y, v.start[1]]} rotation={[0, angle, 0]}>
          <mesh material={mat} position={[0, 0, (len - head) / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <cylinderGeometry args={[0.035, 0.035, Math.max(len - head, 0.001), 10]} />
          </mesh>
          <mesh material={mat} position={[0, 0, len - head / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={10}>
            <coneGeometry args={[0.12, head, 16]} />
          </mesh>
        </group>
      )}
      <Html position={[v.end[0], y + 0.3, v.end[1]]} center style={{ pointerEvents: 'none' }}>
        <div className="vector-tag">V{v.n} · {len.toFixed(2)} m</div>
      </Html>
    </group>
  )
}

function roomName(house: House, p: P2) {
  return house.rooms.find((r) => pointInPolygon(p, r.poly))?.name ?? 'udenfor huset'
}

function nearestItems(p: P2, max: number, radius: number, exclude?: string) {
  return furnitureItems
    .filter((it) => it.id !== exclude)
    .map((it) => ({ it, d: Math.hypot(it.pos[0] - p[0], it.pos[1] - p[1]) }))
    .filter((x) => x.d <= radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
}

const fmt = (v: number) => v.toFixed(2)
const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)

/** Tekst der kan indsættes i Claude for at placere/omplacere møbler i data/furniture.json. */
export function vectorText(v: VectorRec, house: House) {
  const dx = v.end[0] - v.start[0], dz = v.end[1] - v.start[1]
  const len = Math.hypot(dx, dz)
  let dir = Math.round((Math.atan2(dx, dz) * 180) / Math.PI)
  if (dir <= -180) dir += 360
  const item = furnitureItems.find((i) => i.id === v.startItemId)
  const startNear = item ? [] : nearestItems(v.start, 2, 0.8)
  const endNear = nearestItems(v.end, 3, 1.2, v.startItemId)

  const lines = [
    `[Amballegaard vektor V${v.n}]`,
    `Fra: x=${fmt(v.start[0])}, z=${fmt(v.start[1])} (${roomName(house, v.start)})` +
      (item
        ? ` — på møbel id="${item.id}" "${item.name}" (nu pos=[${item.pos.join(', ')}], rot=${item.rot ?? 0}°)`
        : startNear.length
          ? ` — intet møbel ramt; nærmest: ${startNear.map((x) => `id="${x.it.id}" (${x.d.toFixed(2)} m)`).join(', ')}`
          : ' — intet møbel'),
    `Til: x=${fmt(v.end[0])}, z=${fmt(v.end[1])} (${roomName(house, v.end)})` +
      (endNear.length ? ` — nær: ${endNear.map((x) => `id="${x.it.id}" (${x.d.toFixed(2)} m)`).join(', ')}` : ''),
    `Vektor: Δx=${signed(dx)}, Δz=${signed(dz)} m · længde ${len.toFixed(2)} m · retning ${dir}°`,
    wallLine(house, v.start, dir),
    `(Koordinater i meter som i data/house.json og data/furniture.json; retning bruger samme konvention som "rot": 0° = +z/nedad på plantegningen, 90° = +x/højre.)`,
  ]
  return lines.join('\n')
}

/** Nærmeste vægflade ved startpunktet og den rot et møbel får, hvis bagsiden står mod den og fronten peger som vektoren. */
function wallLine(house: House, p: P2, dir: number) {
  let best: { d: number; face: P2; normal: P2 } | null = null
  for (const seg of layoutWalls(house)) {
    const rx = p[0] - seg.a[0], rz = p[1] - seg.a[1]
    const t = Math.max(0, Math.min(seg.len, rx * seg.dir[0] + rz * seg.dir[1]))
    const cx = seg.a[0] + seg.dir[0] * t, cz = seg.a[1] + seg.dir[1] * t
    const side = Math.sign(rx * seg.n[0] + rz * seg.n[1]) || 1
    const dist = Math.hypot(p[0] - cx, p[1] - cz) - seg.thickness / 2
    if (!best || dist < best.d) best = { d: dist, face: [cx + seg.n[0] * side * seg.thickness / 2, cz + seg.n[1] * side * seg.thickness / 2], normal: [seg.n[0] * side, seg.n[1] * side] }
  }
  if (!best) return ''
  const wallDir = Math.round((Math.atan2(best.normal[0], best.normal[1]) * 180) / Math.PI)
  // Altid nærmeste 45° — ingen møbler står med et par graders skævhed.
  const snapped = Math.round(dir / 45) * 45
  return `Væg ved start: ${best.d.toFixed(2)} m væk, vægflade ved x=${fmt(best.face[0])}, z=${fmt(best.face[1])}, væggens normal peger ${wallDir}° · front-retning ${dir}° → rot ${snapped === -180 ? 180 : snapped}° (nærmeste 45°)`
}
