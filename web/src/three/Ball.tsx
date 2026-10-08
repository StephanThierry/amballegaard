import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import type { House, P2 } from '../types'
import { setControlsEnabled } from './camera'
import { getObstacleRects } from './ObstacleReporter'
import { isOnLawn } from './layout'

const RADIUS = 0.12
const GRAVITY = 9.8
const LIFT = 0.32

let ballTexture: THREE.CanvasTexture | null = null

/** Orange basketball-tekstur: læderkornet bund, fire "meridianer" og en ækvatorlinje. Tegnes og caches én gang. */
function getBasketballTexture() {
  if (ballTexture) return ballTexture
  const W = 512, H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#d9631f'
  ctx.fillRect(0, 0, W, H)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 3000; i++) {
    const x = rnd() * W, y = rnd() * H
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'
    ctx.fillRect(x, y, 1.4, 1.4)
  }
  ctx.strokeStyle = '#17120d'
  ctx.lineWidth = H * 0.026
  ctx.lineCap = 'round'
  for (const u of [0, 0.25, 0.5, 0.75]) {
    ctx.beginPath()
    ctx.moveTo(u * W, 0)
    ctx.lineTo(u * W, H)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0, H / 2)
  ctx.lineTo(W, H / 2)
  ctx.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  ballTexture = t
  return t
}

/** Skubber et punkt væk fra alle vægge (eksteriør + interiør), så bolden aldrig lander i murværket. */
function pushFromWalls(house: House, x: number, z: number, clearance: number): P2 {
  const ext = house.exterior
  const segs: { a: P2; b: P2; half: number }[] = ext.map((a, i) => ({ a, b: ext[(i + 1) % ext.length], half: house.exteriorWallThickness / 2 }))
  for (const w of house.interiorWalls) segs.push({ a: w.a, b: w.b, half: (w.thickness ?? house.interiorWallThickness) / 2 })
  let px = x, pz = z
  for (let iter = 0; iter < 3; iter++) {
    for (const { a, b, half } of segs) {
      const abx = b[0] - a[0], abz = b[1] - a[1]
      const len2 = abx * abx + abz * abz || 1e-9
      const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / len2))
      const cx = a[0] + abx * t, cz = a[1] + abz * t
      const dx = px - cx, dz = pz - cz
      const d = Math.hypot(dx, dz)
      const min = half + clearance
      if (d >= min) continue
      if (d > 1e-6) { px = cx + (dx / d) * min; pz = cz + (dz / d) * min } else {
        const inv = 1 / Math.sqrt(len2)
        px = cx - abz * inv * min
        pz = cz + abx * inv * min
      }
    }
  }
  return [px, pz]
}

/** Skubber et punkt ud af møblernes akse-rettede fodaftryk (cirkel mod rektangel). */
function pushFromFurniture(x: number, z: number, radius: number): P2 {
  let px = x, pz = z
  for (const r of getObstacleRects()) {
    const cx = Math.max(r.x0, Math.min(px, r.x1))
    const cz = Math.max(r.z0, Math.min(pz, r.z1))
    const dx = px - cx, dz = pz - cz
    const d = Math.hypot(dx, dz)
    if (d >= radius) continue
    if (d > 1e-6) { px = cx + (dx / d) * radius; pz = cz + (dz / d) * radius } else {
      const dl = px - r.x0, dr = r.x1 - px, dt = pz - r.z0, db = r.z1 - pz
      const m = Math.min(dl, dr, dt, db)
      if (m === dl) px = r.x0 - radius
      else if (m === dr) px = r.x1 + radius
      else if (m === dt) pz = r.z0 - radius
      else pz = r.z1 + radius
    }
  }
  return [px, pz]
}

function resolve(house: House | null, x: number, z: number, radius: number): P2 {
  let p: P2 = [x, z]
  if (house) p = pushFromWalls(house, p[0], p[1], radius)
  p = pushFromFurniture(p[0], p[1], radius)
  return p
}

/**
 * Basketball, der kan trækkes rundt med musen ligesom beboerne (samme raycast-mod-gulvet-mekanik), og som
 * falder og hopper realistisk med aftagende hop når man slipper den. Hopper næsten ikke på græs (høj
 * dæmpning) og kan aldrig ende inde i vægge eller møbler — begge dele tjekkes hvert billede.
 */
export function Basketball({ pos }: { pos: [number, number] }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: getBasketballTexture(), roughness: 0.5 }), [])
  const root = useRef<THREE.Group>(null)
  const lift = useRef<THREE.Group>(null)
  const roll = useRef<THREE.Group>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const s = useRef({
    x: pos[0], z: pos[1], y: RADIUS,
    vx: 0, vz: 0, vy: 0,
    dragging: false,
    settled: true,
    ground: new THREE.Vector3(),
  })

  useFrame((frame, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    const house = useStore.getState().house
    const g = root.current, lg = lift.current
    if (!g || !lg) return
    const st = s.current

    if (st.dragging) {
      raycaster.setFromCamera(frame.pointer, frame.camera)
      if (raycaster.ray.intersectPlane(groundPlane, st.ground)) {
        const [x, z] = resolve(house, st.ground.x, st.ground.z, RADIUS)
        st.x = x; st.z = z
        st.vx = 0; st.vz = 0; st.vy = 0
      }
    } else if (!st.settled) {
      st.vy -= GRAVITY * dt
      let nx = st.x + st.vx * dt
      let nz = st.z + st.vz * dt
      let ny = st.y + st.vy * dt
      const grass = house ? isOnLawn(house, [nx, nz]) : false
      if (ny <= RADIUS) {
        ny = RADIUS
        if (Math.abs(st.vy) < 0.35) {
          st.vy = 0; st.vx = 0; st.vz = 0
          st.settled = true
        } else {
          st.vy = -st.vy * (grass ? 0.12 : 0.58)
          const friction = grass ? 0.5 : 0.86
          st.vx *= friction
          st.vz *= friction
        }
      }
      ;[nx, nz] = resolve(house, nx, nz, RADIUS)
      st.x = nx; st.z = nz; st.y = ny
    }

    g.position.x = st.x
    g.position.z = st.z
    lg.position.y = st.y + (st.dragging ? LIFT : 0)
    const speed = Math.hypot(st.vx, st.vz)
    if (speed > 0.002 && roll.current) {
      const axis = new THREE.Vector3(-st.vz, 0, st.vx).normalize()
      roll.current.rotateOnWorldAxis(axis, (speed * dt) / RADIUS)
    }
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || useStore.getState().tool === 'vector') return
    e.stopPropagation()
    setControlsEnabled(false)
    const startX = e.nativeEvent.clientX, startY = e.nativeEvent.clientY
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        started = true
        s.current.dragging = true
        document.body.style.cursor = 'grabbing'
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setControlsEnabled(true)
      document.body.style.cursor = ''
      if (started) { s.current.dragging = false; s.current.settled = false }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <group ref={root} position={[pos[0], 0, pos[1]]} userData={{ dynamic: true }}
      onPointerDown={onPointerDown}
      onPointerOver={() => { if (!s.current.dragging) document.body.style.cursor = 'grab' }}
      onPointerOut={() => { if (!s.current.dragging) document.body.style.cursor = '' }}>
      <group ref={lift} position={[0, RADIUS, 0]}>
        <group ref={roll}>
          <mesh material={mat} castShadow receiveShadow><sphereGeometry args={[RADIUS, 24, 18]} /></mesh>
        </group>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[RADIUS * 1.15, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  )
}
