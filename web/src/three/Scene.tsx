import { CameraControls, Environment } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { currentSimSeconds, useStore } from '../store'
import type { House, P2 } from '../types'
import { Avatars } from './Avatars'
import { Floors } from './Floors'
import { Furniture } from './Furniture'
import { facingSignature } from './layout'
import { getMaterials } from './materials'
import { Openings } from './Openings'
import { Roofs } from './Roofs'
import { Site } from './Site'
import { Walls } from './Walls'
import { ObstacleReporter } from './ObstacleReporter'
import { MowerAndDock } from './Mower'
import { SUNRISE_HOUR, SUNSET_HOUR } from './sun'
import { useVectorPointerDown, VectorLayer } from './VectorTool'
import { houseCenter, registerControls } from './camera'

export const ISO_POLAR = 0.96

export function Scene() {
  const house = useStore((s) => s.house)
  const c = useMemo(() => (house ? houseCenter(house) : null), [house])
  if (!house || !c) return null
  return (
    <Canvas shadows="soft" orthographic dpr={[1, 2]}
      camera={{ position: [c.x + 40, 46, c.z + 40], zoom: 34, near: 0.1, far: 500 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => useStore.getState().set({ selectedAgent: null, followAgent: false })}>
      <World house={house} center={c} />
    </Canvas>
  )
}

function World({ house, center }: { house: House; center: THREE.Vector3 }) {
  const wallMode = useStore((s) => s.wallMode)
  const showRoof = useStore((s) => s.showRoof)
  const camera = useThree((s) => s.camera)
  const controls = useRef<CameraControls>(null)
  const [cam, setCam] = useState<P2>([0.707, 0.707])
  const sig = useRef('')

  const placed = useRef(false)
  useEffect(() => {
    registerControls(controls.current)
    if (import.meta.env.DEV) (window as unknown as { __cc: unknown }).__cc = controls.current
    // Kun første gang — ellers nulstilles kameraet hver gang Scene gengives (fx ved skift af værktøj).
    if (placed.current) return
    placed.current = true
    controls.current?.setLookAt(center.x + 40, 46, center.z + 40, center.x, 0, center.z, false)
  }, [center])

  // Opdater "hvilke vægge vender mod kameraet" kun når kvadranten skifter.
  useFrame(() => {
    const ctl = controls.current
    if (!ctl) return
    const t = ctl.getTarget(new THREE.Vector3())
    const d = camera.position.clone().sub(t)
    const len = Math.hypot(d.x, d.z) || 1
    const dir: P2 = [d.x / len, d.z / len]
    const s = facingSignature(house, dir)
    if (s !== sig.current) {
      sig.current = s
      setCam(dir)
    }

    const st = useStore.getState()
    if (st.followAgent && st.selectedAgent) {
      const a = st.snapshot?.agents.find((x) => x.id === st.selectedAgent)
      if (a) ctl.moveTo(a.x, 0, a.z, true)
    }
  })

  const roofVisible = showRoof && wallMode === 'full'
  const onVectorDown = useVectorPointerDown()

  return (
    <>
      <CameraControls ref={controls} makeDefault minPolarAngle={0.3} maxPolarAngle={1.35} minZoom={8} maxZoom={1200}
        dollyToCursor smoothTime={0.35} />
      <Lighting house={house} center={center} />
      <group onPointerDown={onVectorDown}>
        <Site house={house} />
        <Floors house={house} />
        <Walls house={house} mode={wallMode} cam={cam} />
        <Openings house={house} mode={wallMode} cam={cam} />
        <Roofs house={house} visible={roofVisible} />
        <Furniture />
        <Avatars />
        <MowerAndDock />
      </group>
      <ObstacleReporter />
      <VectorLayer />
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={0.9} intensity={2.2} distanceFalloff={0.6} quality="medium" />
        <Bloom intensity={0.35} luminanceThreshold={1.1} mipmapBlur />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}

/** Sol, himmel og natbelysning styret af simuleret klokkeslæt og husets nordretning. */
function Lighting({ house, center }: { house: House; center: THREE.Vector3 }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  const mats = getMaterials()
  const roomLights = useRef<THREE.PointLight[]>([])
  const bg = useMemo(() => ({ day: new THREE.Color('#dfe4e8'), dusk: new THREE.Color('#e8c9a8'), night: new THREE.Color('#141b26'), cur: new THREE.Color() }), [])
  const glassGlow = useMemo(() => new THREE.Color('#ffc27a'), [])

  const roomCenters = useMemo(() => house.rooms
    .filter((r) => !['garage', 'tek', 'vikt', 'walkin'].includes(r.id))
    .map((r) => {
      const xs = r.poly.map((p) => p[0]), zs = r.poly.map((p) => p[1])
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] as P2
    }), [house])

  const a = (house.northAngleDeg * Math.PI) / 180
  const N = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a))
  // Øst = nord drejet 90° med uret i plan-koordinater (x højre, z ned).
  const E = new THREE.Vector3(-N.z, 0, N.x)

  useFrame(() => {
    const secs = currentSimSeconds()
    const h = (secs / 3600) % 24
    const sunrise = SUNRISE_HOUR, sunset = SUNSET_HOUR, maxElev = (55 * Math.PI) / 180
    const dayT = (h - sunrise) / (sunset - sunrise)
    const elev = dayT > 0 && dayT < 1 ? Math.sin(Math.PI * dayT) * maxElev : -0.2
    const az = ((h - 13) * 15 * Math.PI) / 180 // fra syd mod vest
    const S = N.clone().negate(), W = E.clone().negate()
    const horiz = S.multiplyScalar(Math.cos(az)).add(W.multiplyScalar(Math.sin(az)))
    const dir = horiz.multiplyScalar(Math.cos(Math.max(elev, 0.05))).add(new THREE.Vector3(0, Math.sin(Math.max(elev, 0.05)), 0)).normalize()
    const day = THREE.MathUtils.smoothstep(elev, -0.03, 0.18)
    const dusk = day * (1 - THREE.MathUtils.smoothstep(elev, 0.05, 0.35))

    if (sun.current) {
      sun.current.position.copy(center).addScaledVector(dir, 60)
      sun.current.target.position.copy(center)
      sun.current.target.updateMatrixWorld()
      sun.current.intensity = 3.6 * day
      sun.current.color.setRGB(1, 0.93 - dusk * 0.25, 0.86 - dusk * 0.4)
    }
    scene.environmentIntensity = 0.1 + 0.55 * day
    bg.cur.copy(bg.night).lerp(bg.day, day).lerp(bg.dusk, dusk * 0.6)
    scene.background = bg.cur
    const night = 1 - day
    for (const l of roomLights.current) if (l) l.intensity = 5 * night
    mats.glass.emissive.copy(glassGlow)
    mats.glass.emissiveIntensity = 0.9 * night
  })

  return (
    <>
      <Environment files="/assets/hdri/sky.hdr" />
      <hemisphereLight args={['#dfe9f5', '#6d6450', 0.25]} />
      <directionalLight ref={sun} castShadow intensity={3} shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={34} shadow-camera-bottom={-34}
        shadow-camera-near={1} shadow-camera-far={140} shadow-bias={-0.0004} shadow-normalBias={0.035} />
      {roomCenters.map(([x, z], i) => (
        <pointLight key={i} ref={(l) => { if (l) roomLights.current[i] = l }} position={[x, 2.1, z]} color="#ffd29c"
          intensity={0} distance={7} decay={1.6} />
      ))}
    </>
  )
}
