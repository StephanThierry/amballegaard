import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { gaitPose } from './gait'
import { STEPHAN, controls } from './shared'

/** Lader en figur gå i en cirkel (radius r) med fronten i gangretningen. */
export function WalkCircle({ r = 0.9, speed = 0.55, offset = 0, children }: { r?: number; speed?: number; offset?: number; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const a = useRef(offset)
  const amt = useRef(1)
  useFrame((_, dt) => {
    amt.current += ((controls.walking ? 1 : 0) - amt.current) * Math.min(1, dt * 4)
    a.current += dt * controls.speed * speed * amt.current / r
    g.current!.position.set(Math.cos(a.current) * r, 0, -Math.sin(a.current) * r)
    // Tangent ved mod uret-bevægelse i xz (−sin, −cos) → heading = atan2(x, z)
    g.current!.rotation.y = Math.atan2(-Math.sin(a.current), -Math.cos(a.current))
  })
  return <group ref={g}>{children}</group>
}

/** Skeletanimeret figur (glTF med rigtig skeletal "walk"-animation, fx Mixamo-rigget). */
export function SkeletalAvatar({ url, clip, tint }: { url: string; clip: string; tint?: Record<string, string> }) {
  const { scene, animations } = useGLTF(url)
  // Hver URL bruges kun én gang på siden, så den indlæste scene kan bruges direkte (SkinnedMesh deler skelet).
  const obj = scene
  const { actions } = useAnimations(animations, obj)
  useEffect(() => {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const mat = mesh.material as THREE.MeshStandardMaterial
      for (const [name, color] of Object.entries(tint ?? {})) if (mat.name?.includes(name)) mat.color.set(color)
    })
    const a = actions[clip]
    a?.reset().fadeIn(0.3).play()
    return () => { a?.fadeOut(0.3) }
  }, [actions, clip, obj, tint])
  useFrame(() => { const a = actions[clip]; if (a) a.timeScale = controls.walking ? controls.speed : 0 })
  return <primitive object={obj} />
}

/**
 * Procedural pixelart: tegner Stephan i et 32×48 px canvas hver frame (sideprofil) ud fra den samme naturlige
 * gangcyklus, og viser det som en billboard-tekstur med nearest-filtrering (skarpe pixels).
 */
export function PixelSprite() {
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 48
    const t = new THREE.CanvasTexture(c)
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
    return { tex: t, ctx: c.getContext('2d')! }
  }, [])
  const phase = useRef(0)
  const g = useRef<THREE.Group>(null)
  const x = useRef(0), dir = useRef(1)
  useFrame((_, dt) => {
    const walking = controls.walking ? 1 : 0
    phase.current += dt * 6 * controls.speed * Math.max(0.1, walking)
    x.current += dir.current * dt * 0.5 * controls.speed * walking
    if (Math.abs(x.current) > 1.1) { dir.current *= -1; x.current = Math.sign(x.current) * 1.1 }
    g.current!.position.x = x.current
    g.current!.scale.x = dir.current
    const p = gaitPose(phase.current, 'natural', walking)
    drawPixelStephan(ctx, p)
    tex.needsUpdate = true
  })
  return (
    <group ref={g}>
      <mesh position={[0, 0.96, 0]}>
        <planeGeometry args={[1.28, 1.92]} />
        <meshBasicMaterial map={tex} transparent alphaTest={0.5} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function drawPixelStephan(ctx: CanvasRenderingContext2D, p: ReturnType<typeof gaitPose>) {
  const S = STEPHAN
  ctx.clearRect(0, 0, 32, 48)
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
  // Lem som kæde af pixels: start (x,y), vinkel fra lodret (positiv = bagud = mod venstre i sideprofil der går mod højre)
  const limb = (x: number, y: number, a1: number, l1: number, a2: number, l2: number, w: number, c1: string, c2: string, foot?: string) => {
    let cx = x, cy = y
    for (let i = 0; i < l1; i++) { px(cx - w / 2, cy, w, 1, c1); cx -= Math.sin(a1); cy += Math.cos(a1) }
    for (let i = 0; i < l2; i++) { px(cx - w / 2, cy, w, 1, c2); cx -= Math.sin(a1 + a2); cy += Math.cos(a1 + a2) }
    if (foot) px(cx - 2, cy - 1, 5, 2, foot)
  }
  const bob = Math.round(p.bob * 40)
  const hipX = 15, hipY = 25 + bob
  // Bagerste ben/arm mørkere for dybde
  limb(hipX, hipY, p.legs[1].hip, 9, p.legs[1].knee, 10, 3, '#2c3240', '#2c3240', '#101114')
  limb(hipX + 1, 15 + bob, p.arms[1].shoulder, 6, -p.arms[1].elbow * -1, 5, 2, '#1a1f29', '#d9ad90')
  // Krop
  px(11, 13 + bob, 9, 13, S.top)
  px(11, 24 + bob, 9, 3, S.bottom)
  limb(hipX, hipY, p.legs[0].hip, 9, p.legs[0].knee, 10, 3, S.bottom, S.bottom, '#1c1d20')
  // Hoved
  px(11, 3 + bob, 10, 10, S.skin)
  px(10, 1 + bob, 12, 4, S.hair); px(10, 3 + bob, 3, 5, S.hair)
  px(18, 11 + bob, 3, 2, S.goatee!) // hageskæg
  px(19, 6 + bob, 1, 2, '#141518')
  px(21, 7 + bob, 1, 2, S.skin)
  limb(hipX + 1, 15 + bob, p.arms[0].shoulder, 6, -p.arms[0].elbow * -1, 5, 2, S.top, S.skin)
}
