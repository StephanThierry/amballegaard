import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { moveAgent, pickUpAgent, useStore } from '../store'
import { setControlsEnabled } from './camera'
import { LowPolyResident, PixelResident, VoxelResident } from './StyledAvatars'
import type { AgentInfo, Appearance } from '../types'

const mat = (color: string, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness })

export function Avatars() {
  const agents = useStore((s) => s.agents)
  const active = useStore((s) => s.snapshot?.agents.filter((a) => a.active !== false).map((a) => a.id).join(',') ?? '')
  return <>{agents.filter((a) => active.split(',').includes(a.id)).map((a) => <Avatar key={a.id} info={a} />)}</>
}

export function LoveEffect() {
  const kind = useStore((s) => s.snapshot?.loveEffect ?? null)
  const stephan = useStore((s) => s.snapshot?.agents.find((a) => a.id === 'stephan'))
  const lisa = useStore((s) => s.snapshot?.agents.find((a) => a.id === 'lisa'))
  if (!kind || !stephan || !lisa) return null
  const x = (stephan.x + lisa.x) / 2
  const z = (stephan.z + lisa.z) / 2
  return (
    <Html position={[x, 1.9, z]} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
      <div className="love-emoji-wrap"><span className="love-emoji">{kind === 'kiss' ? '💋' : '❤️'}</span></div>
    </Html>
  )
}

function Avatar({ info }: { info: AgentInfo }) {
  const H = info.appearance.height
  const root = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const state = useRef({
    init: false, pos: new THREE.Vector3(), heading: 0, phase: 0, speed: 0, lift: 0,
    pin: null as { x: number; z: number; until: number } | null,
    ground: new THREE.Vector3(),
    sleepProgress: 0,
  })
  const selected = useStore((s) => s.selectedAgent === info.id)
  const dragging = useStore((s) => s.dragging === info.id)
  const style = useStore((s) => s.avatarStyle)
  const speedRef = useRef(0)
  const flailRef = useRef(false)
  const headingRef = useRef(0)
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
    const timeScale = useStore.getState().snapshot?.timeScale ?? 1
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

    // Lerp følger hurtigere med ved 2×, 4× og 8×, så avataren ikke halter bagud
    const followRate = isDragged ? 18 : Math.max(6, 6 * Math.sqrt(timeScale))
    s.pos.lerp(target, 1 - Math.exp(-dt * followRate))
    const v = before.distanceTo(s.pos) / Math.max(dt, 1e-3)
    s.speed += (v - s.speed) * Math.min(1, dt * 8)

    if (!isDragged) {
      let dh = snap.heading - s.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      s.heading += dh * Math.min(1, dt * Math.max(8, 8 * timeScale))
    }
    s.lift += ((isDragged ? 0.45 : 0) - s.lift) * Math.min(1, dt * 10)
    g.position.copy(s.pos)
    g.position.y += s.lift
    g.rotation.y = s.heading
    speedRef.current = isDragged ? 0 : s.speed
    flailRef.current = isDragged
    headingRef.current = s.heading

    if (isDragged) {
      s.phase += dt * 9
      const d = Math.sin(s.phase) * 0.35
      if (legL.current) legL.current.rotation.x = d
      if (legR.current) legR.current.rotation.x = -d
      if (armL.current) armL.current.rotation.set(-2.6, 0, -0.2)
      if (armR.current) armR.current.rotation.set(-2.6, 0, 0.2)
      return
    }

    const isSleeping = snap.activity === 'sleeping'
    const isTidying = snap.activity === 'tidying'

    s.sleepProgress += ((isSleeping ? 1 : 0) - s.sleepProgress) * Math.min(1, dt * 6)

    if (s.sleepProgress > 0.01) {
      if (info.kind === 'dog') {
        if (body.current) {
          body.current.position.y = -0.16 * s.sleepProgress
          body.current.rotation.set(0, 0, 0)
        }
      } else {
        if (body.current) {
          body.current.rotation.x = (-Math.PI / 2) * s.sleepProgress
          body.current.position.y = 0.18 * s.sleepProgress
          body.current.position.z = (H * 0.45) * s.sleepProgress
        }
      }
      if (legL.current) legL.current.rotation.set(0, 0, 0)
      if (legR.current) legR.current.rotation.set(0, 0, 0)
      if (armL.current) armL.current.rotation.set(0, 0, 0)
      if (armR.current) armR.current.rotation.set(0, 0, 0)
      return
    }

    if (body.current) {
      body.current.rotation.set(0, 0, 0)
      body.current.position.z = 0
    }

    const walking = Math.min(1, s.speed / 0.4)
    // Skalerer ben/arm sving med reel ganghastighed (ved 4×/8× løber de med hurtigere skridt)
    const animSpeedMult = Math.max(1, s.speed / 0.8)
    s.phase += dt * (info.kind === 'dog' ? 11 : 7.5) * walking * animSpeedMult
    const swing = Math.sin(s.phase) * 0.55 * walking

    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing

    if (isTidying && walking < 0.1) {
      const tidyWave = Math.sin(frame.clock.elapsedTime * 6) * 0.35
      if (armL.current) armL.current.rotation.set(-0.45 + tidyWave, 0, 0.1)
      if (armR.current) armR.current.rotation.set(-0.45 - tidyWave, 0, -0.1)
    } else {
      if (armL.current) armL.current.rotation.set(-swing * 0.8, 0, 0)
      if (armR.current) armR.current.rotation.set(swing * 0.8, 0, 0)
    }

    if (body.current) body.current.position.y = Math.abs(Math.cos(s.phase)) * 0.025 * walking
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    set({ selectedAgent: selected ? null : info.id })
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || useStore.getState().tool === 'vector') return
    e.stopPropagation()
    setControlsEnabled(false)
    const startX = e.nativeEvent.clientX, startY = e.nativeEvent.clientY
    let started = false
    let chatter = 0
    const move = (ev: PointerEvent) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        started = true
        useStore.getState().set({ dragging: info.id, selectedAgent: info.id, followAgent: false })
        document.body.style.cursor = 'grabbing'
        pickUpAgent(info.id)
        chatter = window.setInterval(() => pickUpAgent(info.id), 3200)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setControlsEnabled(true)
      document.body.style.cursor = ''
      window.clearInterval(chatter)
      if (!started) return
      const { x, z } = state.current.ground
      state.current.pin = { x, z, until: performance.now() + 1500 }
      useStore.getState().set({ dragging: null })
      moveAgent(info.id, x, z)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <group ref={root} onClick={onClick} onPointerDown={onPointerDown}
      onPointerOver={() => { if (!useStore.getState().dragging) document.body.style.cursor = 'grab' }}
      onPointerOut={() => { if (!useStore.getState().dragging) document.body.style.cursor = '' }}>
      <group ref={body}>
        {style === 'voxel'
          ? <VoxelResident info={info} speedRef={speedRef} flailRef={flailRef} />
          : style === 'pixel'
            ? <PixelResident info={info} speedRef={speedRef} headingRef={headingRef} flailRef={flailRef} />
            : info.kind === 'dog'
              ? <DogBody a={info.appearance} legs={[legL, legR, armL, armR]} />
              : <LowPolyResident info={info} speedRef={speedRef} flailRef={flailRef} />}
      </group>
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
        <Html 
          position={[0, state.current.sleepProgress > 0.5 ? 0.45 : H + 0.3, state.current.sleepProgress > 0.5 ? 0.3 : 0]} 
          zIndexRange={[20, 0]} 
          style={{ pointerEvents: 'none' }}>
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

function DogBody({ a, legs }: { a: Appearance; legs: LimbRef[] }) {
  const fur = useMemo(() => mat(a.hair, 0.95), [a.hair])
  const dark = useMemo(() => mat('#2a2018', 0.5), [])
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