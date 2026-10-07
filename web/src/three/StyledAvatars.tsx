import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Biped } from '../showcase/Biped'
import { flailPose } from '../showcase/gait'
import { drawPerson, poseFor, type Dir, type PixelPerson } from '../showcase/pixelFamily'
import type { Look } from '../showcase/shared'
import { VoxelDog } from '../showcase/VoxelDog'
import type { AgentInfo } from '../types'

/** Beboerens udseende (fra serveren) oversat til showcase-figurernes beskrivelse. */
const hairMap = { shortSpiky: 'short', longStraight: 'long', shortMessy: 'messy', ponytail: 'ponytail', dog: 'short' } as const

export function lookFor(info: AgentInfo): Look {
  const a = info.appearance
  return {
    name: info.name, height: a.height, skin: a.skin, hair: a.hair, hairStyle: hairMap[a.hairStyle],
    top: a.top, bottom: a.bottom, goatee: a.beard ?? undefined, child: info.kind === 'child',
    pattern: a.pattern === 'plaid' ? 'plaid' : undefined, feminine: !!a.feminine,
    shoes: info.kind === 'child' && a.hairStyle === 'ponytail' ? '#f0f0f0' : undefined,
  }
}

export function pixelPersonFor(info: AgentInfo): PixelPerson {
  const a = info.appearance
  if (info.kind === 'dog') return { id: info.id, name: info.name, height: a.height, skin: a.skin, hair: '#a87d47', hairStyle: 'dog', top: a.top, bottom: a.bottom, shoes: '#2a2018' }
  const l = lookFor(info)
  return { id: info.id, name: info.name, height: a.height, skin: l.skin, hair: l.hair, hairStyle: l.hairStyle, top: l.top, bottom: l.bottom, shoes: l.shoes ?? (l.feminine ? '#6b4a32' : '#18191c'), goatee: l.goatee, child: l.child, pattern: l.pattern, feminine: l.feminine }
}

/** Voxelfigur i huset; gangen styres af beboerens faktiske fart. */
export function VoxelResident({ info, speedRef, flailRef }: { info: AgentInfo; speedRef: { current: number }; flailRef: { current: boolean } }) {
  const look = useMemo(() => lookFor(info), [info])
  if (info.kind === 'dog') return <VoxelDog color={info.appearance.skin} speedRef={speedRef} flailRef={flailRef} />
  return <Biped style="voxel" gait={look.child ? 'bouncy' : 'natural'} look={look} speedRef={speedRef} flailRef={flailRef} />
}

/** Low-poly-figur med naturlig gang (samme som showcasens "Low-poly med naturlig gang"). */
export function LowPolyResident({ info, speedRef, flailRef }: { info: AgentInfo; speedRef: { current: number }; flailRef: { current: boolean } }) {
  const look = useMemo(() => lookFor(info), [info])
  return <Biped style="lowpoly" gait={look.child ? 'bouncy' : 'natural'} look={look} speedRef={speedRef} flailRef={flailRef} />
}

const PX_PER_M = 26
const SPRITE_W = 40, SPRITE_H = 64

/**
 * Pixelart-beboer: et billboard (vender altid mod kameraet) hvis sprite tegnes hver frame i den af de 8 retninger
 * der passer til beboerens gangretning set fra kameraet.
 */
export function PixelResident({ info, speedRef, headingRef, flailRef }: { info: AgentInfo; speedRef: { current: number }; headingRef: { current: number }; flailRef: { current: boolean } }) {
  const person = useMemo(() => pixelPersonFor(info), [info])
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement('canvas'); c.width = SPRITE_W; c.height = SPRITE_H
    const t = new THREE.CanvasTexture(c)
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
    return { tex: t, ctx: c.getContext('2d')! }
  }, [])
  const st = useRef({ phase: 0, amt: 0 })
  const camDir = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }, dt) => {
    const s = st.current
    s.amt += (Math.min(1, speedRef.current / 0.6) - s.amt) * Math.min(1, dt * 5)
    s.phase += dt * (person.hairStyle === 'dog' ? 9 : person.child ? 7 : 6) * Math.max(0.12, s.amt)
    camera.getWorldDirection(camDir)
    const camYaw = Math.atan2(-camDir.x, -camDir.z) // retning fra scenen mod kameraet
    const rel = Math.atan2(Math.sin(headingRef.current - camYaw), Math.cos(headingRef.current - camYaw))
    const dir = ((((Math.round(rel / (Math.PI / 4))) % 8) + 8) % 8) as Dir
    ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)
    const pose = flailRef.current ? flailPose(performance.now() / 1000) : poseFor(person, s.phase, s.amt)
    drawPerson(ctx, SPRITE_W / 2, SPRITE_H - 2, person, pose, flailRef.current ? 0 : dir)
    tex.needsUpdate = true
  })
  return (
    <sprite position={[0, SPRITE_H / PX_PER_M / 2, 0]} scale={[SPRITE_W / PX_PER_M, SPRITE_H / PX_PER_M, 1]}>
      <spriteMaterial map={tex} alphaTest={0.5} transparent={false} toneMapped={false} />
    </sprite>
  )
}
