import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { moveAgent, pickUpAgent, useStore } from '../store'
import { setControlsEnabled } from './camera'
import type { AgentInfo, Appearance } from '../types'

const mat = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness })

export function Avatars() {
  const agents = useStore((s) => s.agents)
  return <>{agents.map((a) => <Avatar key={a.id} info={a} />)}</>
}

function Avatar({ info }: { info: AgentInfo }) {
  const root = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const state = useRef({
    init: false, pos: new THREE.Vector3(), heading: 0, phase: 0, speed: 0, lift: 0,
    /** Drop-position der holdes indtil serveren har bekræftet flytningen. */
    pin: null as { x: number; z: number; until: number } | null,
    ground: new THREE.Vector3(),
  })
  const selected = useStore((s) => s.selectedAgent === info.id)
  const dragging = useStore((s) => s.dragging === info.id)
  const speech = useStore((s) => s.snapshot?.agents.find((a) => a.id === info.id)?.speech ?? null)
  const set = useStore((s) => s.set)
  const roomName = useStore((s) => {
    const st = s.snapshot?.agents.find((a) => a.id === info.id)
    return s.house?.rooms.find((r) => r.id === st?.roomId)?.name ?? 'Udenfor'
  })
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])

  useFrame((frame, dt) => {
    const snap = useStore.getState().snapshot?.agents.find((a) => a.id === info.id)
    const g = root.current
    if (!snap || !g) return
    const s = state.current
    const isDragged = useStore.getState().dragging === info.id

    const target = new THREE.Vector3(snap.x, 0.004, snap.z)
    if (isDragged) {
      raycaster.setFromCamera(frame.pointer, frame.camera)
      if (raycaster.ray.intersectPlane(groundPlane, s.ground)) target.set(s.ground.x, 0.004, s.ground.z)
    } else if (s.pin) {
      const confirmed = Math.hypot(snap.x - s.pin.x, snap.z - s.pin.z) < 0.45
      if (confirmed || performance.now() > s.pin.until) s.pin = null
      else target.set(s.pin.x, 0.004, s.pin.z)
    }
    if (!s.init) {
      s.pos.copy(target)
      s.heading = snap.heading
      s.init = true
    }
    const before = s.pos.clone()
    s.pos.lerp(target, 1 - Math.exp(-dt * (isDragged ? 18 : 5)))
    const v = before.distanceTo(s.pos) / Math.max(dt, 1e-3)
    s.speed += (v - s.speed) * Math.min(1, dt * 8)
    if (!isDragged) {
      let dh = snap.heading - s.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      s.heading += dh * Math.min(1, dt * 8)
    }
    s.lift += ((isDragged ? 0.45 : 0) - s.lift) * Math.min(1, dt * 10)
    g.position.copy(s.pos)
    g.position.y += s.lift
    g.rotation.y = s.heading

    if (isDragged) {
      // Dingler med arme og ben mens den bæres.
      s.phase += dt * 9
      const d = Math.sin(s.phase) * 0.35
      if (legL.current) legL.current.rotation.x = d
      if (legR.current) legR.current.rotation.x = -d
      if (armL.current) armL.current.rotation.set(-2.6, 0, -0.2)
      if (armR.current) armR.current.rotation.set(-2.6, 0, 0.2)
      return
    }
    if (armL.current) armL.current.rotation.set(0, 0, 0)
    if (armR.current) armR.current.rotation.set(0, 0, 0)
    const walking = Math.min(1, s.speed / 0.6)
    s.phase += dt * (info.kind === 'dog' ? 11 : 7.5) * walking
    const swing = Math.sin(s.phase) * 0.55 * walking
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
    if (body.current) body.current.position.y = Math.abs(Math.cos(s.phase)) * 0.025 * walking
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    set({ selectedAgent: selected ? null : info.id })
  }

  /** Træk-og-slip: drag starter først når musen har flyttet sig lidt, så et klik stadig vælger beboeren. */
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || useStore.getState().tool === 'vector') return
    e.stopPropagation()
    setControlsEnabled(false)
    const startX = e.nativeEvent.clientX, startY = e.nativeEvent.clientY
    let started = false
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        started = true
        useStore.getState().set({ dragging: info.id, selectedAgent: info.id, followAgent: false })
        document.body.style.cursor = 'grabbing'
        pickUpAgent(info.id)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setControlsEnabled(true)
      document.body.style.cursor = ''
      if (!started) return
      const { x, z } = state.current.ground
      state.current.pin = { x, z, until: performance.now() + 1500 }
      useStore.getState().set({ dragging: null })
      moveAgent(info.id, x, z)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const H = info.appearance.height
  return (
    <group ref={root} onClick={onClick} onPointerDown={onPointerDown}
      onPointerOver={() => { if (!useStore.getState().dragging) document.body.style.cursor = 'grab' }}
      onPointerOut={() => { if (!useStore.getState().dragging) document.body.style.cursor = '' }}>
      <group ref={body}>
        {info.kind === 'dog'
          ? <DogBody a={info.appearance} legs={[legL, legR, armL, armR]} />
          : <HumanBody a={info.appearance} legL={legL} legR={legR} armL={armL} armR={armR} />}
      </group>
      {/* Kontaktskygge under fødderne for at forankre figuren */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[info.kind === 'dog' ? 0.3 : H * 0.17, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {selected && !dragging && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.38, 0.45, 40]} />
          <meshBasicMaterial color="#5fd38d" transparent opacity={0.9} />
        </mesh>
      )}
      {(selected || speech) && (
        <Html position={[0, H + 0.3, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="avatar-label">
            {speech && <div className="bubble">{speech}</div>}
            {selected && <div className="nametag"><b>{info.name}</b><span>{roomName}</span></div>}
          </div>
        </Html>
      )}
    </group>
  )
}

type LimbRef = React.RefObject<THREE.Group | null>

function HumanBody({ a, legL, legR, armL, armR }: { a: Appearance; legL: LimbRef; legR: LimbRef; armL: LimbRef; armR: LimbRef }) {
  const m = useMemo(() => ({
    skin: mat(a.skin, 0.6), top: mat(a.top, 0.9), bottom: mat(a.bottom, 0.9), hair: mat(a.hair, 0.65),
    shoe: mat('#222326', 0.5), eye: mat('#1b1d22', 0.2), beard: a.beard ? mat(a.beard, 0.9) : null,
  }), [a])
  const H = a.height
  const hipY = H * 0.5
  const legLen = hipY - 0.05
  const legR_ = H * 0.052
  const shoulderY = H * 0.8
  const shoulderW = H * (H > 1.5 ? 0.125 : 0.115)
  const armLen = H * 0.36
  const headR = H * (H > 1.5 ? 0.064 : 0.074)
  const headY = H - headR * 1.05

  return (
    <group>
      {/* Ben */}
      {[[legL, -1], [legR, 1]].map(([ref, side]) => (
        <group key={side as number} ref={ref as LimbRef} position={[(side as number) * H * 0.055, hipY, 0]}>
          <mesh material={m.bottom} position={[0, -legLen / 2, 0]} castShadow>
            <capsuleGeometry args={[legR_, legLen - legR_ * 2, 6, 12]} />
          </mesh>
          <mesh material={m.shoe} position={[0, -legLen - 0.005, 0.04]} castShadow>
            <boxGeometry args={[legR_ * 1.9, 0.07, H * 0.15]} />
          </mesh>
        </group>
      ))}
      {/* Bækken + torso */}
      <mesh material={m.bottom} position={[0, hipY + 0.02, 0]} scale={[1.25, 0.6, 0.85]} castShadow>
        <sphereGeometry args={[H * 0.1, 20, 14]} />
      </mesh>
      <mesh material={m.top} position={[0, (hipY + shoulderY) / 2 + 0.02, 0]} scale={[1, 1, 0.62]} castShadow>
        <capsuleGeometry args={[H * 0.105, shoulderY - hipY - H * 0.12, 8, 18]} />
      </mesh>
      <mesh material={m.top} position={[0, shoulderY - 0.01, 0]} scale={[1.55, 0.55, 0.75]} castShadow>
        <sphereGeometry args={[H * 0.085, 20, 12]} />
      </mesh>
      {/* Arme */}
      {[[armL, -1], [armR, 1]].map(([ref, side]) => (
        <group key={side as number} ref={ref as LimbRef} position={[(side as number) * shoulderW, shoulderY - 0.02, 0]} rotation={[0, 0, 0]}>
          <group rotation={[0, 0, (side as number) * 0.07]}>
            <mesh material={m.top} position={[0, -armLen * 0.28, 0]} castShadow>
              <capsuleGeometry args={[H * 0.033, armLen * 0.45, 6, 10]} />
            </mesh>
            <mesh material={m.skin} position={[0, -armLen * 0.72, 0]} castShadow>
              <capsuleGeometry args={[H * 0.027, armLen * 0.38, 6, 10]} />
            </mesh>
            <mesh material={m.skin} position={[0, -armLen - 0.01, 0]} castShadow>
              <sphereGeometry args={[H * 0.03, 12, 10]} />
            </mesh>
          </group>
        </group>
      ))}
      {/* Hals + hoved */}
      <mesh material={m.skin} position={[0, shoulderY + H * 0.035, 0]} castShadow>
        <cylinderGeometry args={[H * 0.028, H * 0.032, H * 0.07, 12]} />
      </mesh>
      <group position={[0, headY, 0]}>
        <mesh material={m.skin} scale={[0.9, 1.08, 0.98]} castShadow><sphereGeometry args={[headR, 28, 20]} /></mesh>
        <mesh material={m.skin} position={[0, -headR * 0.05, headR * 0.92]} scale={[0.6, 1, 0.8]}><sphereGeometry args={[headR * 0.16, 10, 8]} /></mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={m.eye} position={[s * headR * 0.34, headR * 0.12, headR * 0.86]}><sphereGeometry args={[headR * 0.085, 10, 8]} /></mesh>
            <mesh material={m.skin} position={[s * headR * 0.9, 0, 0]} scale={[0.4, 1, 0.7]}><sphereGeometry args={[headR * 0.22, 10, 8]} /></mesh>
          </group>
        ))}
        {m.beard && (
          <mesh material={m.beard} scale={[0.92, 1.08, 1.0]}>
            <sphereGeometry args={[headR * 1.025, 24, 16, Math.PI / 2 - 1.15, 2.3, Math.PI * 0.56, Math.PI * 0.3]} />
          </mesh>
        )}
        <Hair a={a} r={headR} m={m.hair} />
      </group>
    </group>
  )
}

function Hair({ a, r, m }: { a: Appearance; r: number; m: THREE.Material }) {
  const cap = (
    <mesh material={m} position={[0, r * 0.12, -r * 0.05]} scale={[0.95, 1.05, 1.03]} castShadow>
      <sphereGeometry args={[r * 1.02, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
    </mesh>
  )
  switch (a.hairStyle) {
    case 'shortSpiky': {
      const spikes = Array.from({ length: 22 }, (_, i) => {
        const t = i / 22
        const ang = t * Math.PI * 2 * 3.7
        const rad = Math.sqrt(t) * 0.75
        return { x: Math.cos(ang) * rad * r, z: Math.sin(ang) * rad * r * 0.95 + r * 0.05, tilt: rad }
      })
      return (
        <group>
          {cap}
          {spikes.map((s, i) => (
            <mesh key={i} material={m} position={[s.x, r * (0.95 - s.tilt * 0.35), s.z]}
              rotation={[s.z / r * 0.6, 0, -s.x / r * 0.6]} castShadow>
              <coneGeometry args={[r * 0.13, r * 0.38, 6]} />
            </mesh>
          ))}
        </group>
      )
    }
    case 'longStraight':
      return (
        <group>
          {cap}
          <mesh material={m} position={[0, -r * 0.75, -r * 0.42]} scale={[1, 1, 0.5]} castShadow>
            <capsuleGeometry args={[r * 1.0, r * 1.7, 8, 18]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m} position={[s * r * 0.86, -r * 0.55, r * 0.05]} scale={[0.35, 1, 0.55]} castShadow>
              <capsuleGeometry args={[r * 0.5, r * 1.5, 6, 10]} />
            </mesh>
          ))}
          <mesh material={m} position={[0, r * 0.55, r * 0.55]} rotation={[0.9, 0, 0]} scale={[1.6, 0.35, 0.6]}>
            <sphereGeometry args={[r * 0.5, 14, 8]} />
          </mesh>
        </group>
      )
    case 'ponytail':
      return (
        <group>
          {cap}
          <mesh material={m} position={[0, r * 0.35, -r * 1.0]} castShadow><sphereGeometry args={[r * 0.28, 12, 10]} /></mesh>
          <mesh material={m} position={[0, -r * 0.35, -r * 1.12]} rotation={[0.2, 0, 0]} castShadow>
            <capsuleGeometry args={[r * 0.26, r * 1.2, 6, 10]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={m} position={[s * r * 0.82, -r * 0.05, r * 0.15]} scale={[0.3, 1, 0.5]}><sphereGeometry args={[r * 0.45, 10, 8]} /></mesh>
          ))}
        </group>
      )
    default: // shortMessy
      return (
        <group>
          {cap}
          {[[0.3, 0.8, 0.5], [-0.35, 0.85, 0.35], [0, 0.95, 0], [0.5, 0.6, -0.3], [-0.5, 0.65, -0.35], [0.1, 0.85, 0.65]].map(([x, y, z], i) => (
            <mesh key={i} material={m} position={[x * r, y * r, z * r]} castShadow><sphereGeometry args={[r * 0.32, 10, 8]} /></mesh>
          ))}
        </group>
      )
  }
}

function DogBody({ a, legs }: { a: Appearance; legs: LimbRef[] }) {
  const fur = useMemo(() => mat(a.hair, 0.95), [a.hair])
  const dark = useMemo(() => mat('#2a2018', 0.5), [])
  // Trav: diagonale par (forreste venstre + bageste højre) bevæger sig sammen — rækkefølgen matcher legL/legR/armL/armR-svinget.
  const legPos: [number, number][] = [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]
  return (
    <group>
      <mesh material={fur} position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.13, 0.42, 8, 16]} />
      </mesh>
      <group position={[0, 0.52, 0.33]}>
        <mesh material={fur} castShadow><sphereGeometry args={[0.11, 18, 14]} /></mesh>
        <mesh material={fur} position={[0, -0.03, 0.1]} scale={[0.7, 0.6, 1]} castShadow><sphereGeometry args={[0.08, 14, 10]} /></mesh>
        <mesh material={dark} position={[0, -0.01, 0.18]}><sphereGeometry args={[0.02, 8, 6]} /></mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={fur} position={[s * 0.09, 0.0, 0.0]} rotation={[0, 0, s * 0.3]} scale={[0.35, 1, 0.8]} castShadow>
              <sphereGeometry args={[0.08, 10, 8]} />
            </mesh>
            <mesh material={dark} position={[s * 0.045, 0.03, 0.095]}><sphereGeometry args={[0.014, 8, 6]} /></mesh>
          </group>
        ))}
      </group>
      <mesh material={fur} position={[0, 0.48, -0.33]} rotation={[-0.7, 0, 0]} castShadow>
        <capsuleGeometry args={[0.025, 0.22, 4, 8]} />
      </mesh>
      {legPos.map(([x, z], i) => (
        <group key={i} ref={legs[i]} position={[x, 0.32, z]}>
          <mesh material={fur} position={[0, -0.15, 0]} castShadow><capsuleGeometry args={[0.035, 0.24, 4, 8]} /></mesh>
        </group>
      ))}
    </group>
  )
}
