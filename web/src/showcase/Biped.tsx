import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { flailPose, gaitPose, type GaitStyle } from './gait'
import { STEPHAN, controls, type Look } from './shared'

export type BodyStyle = 'current' | 'lowpoly' | 'toy' | 'voxel'

const mat = (color: string, roughness = 0.7, flat = false) =>
  new THREE.MeshStandardMaterial({ color, roughness, flatShading: flat })

interface Dims {
  H: number; hipY: number; hipW: number; thigh: number; shin: number; footL: number
  torsoH: number; shoulderW: number; upperArm: number; foreArm: number; headR: number; limbR: number
}

function dims(style: BodyStyle, look: Look): Dims {
  const H = look.height
  if (style === 'toy') {
    // Store hoveder, korte ben (Animal Crossing / Playmobil-proportioner), skaleret ned så den passer i huset.
    const h = H * 0.62
    return { H: h, hipY: h * 0.36, hipW: h * 0.1, thigh: h * 0.17, shin: h * 0.16, footL: h * 0.12, torsoH: h * 0.25,
      shoulderW: h * 0.15, upperArm: h * 0.13, foreArm: h * 0.12, headR: h * 0.19, limbR: h * 0.07 }
  }
  // Feminin: smallere skuldre og lemmer, lidt bredere hofter.
  const f = look.feminine ? { sh: 0.86, hip: 1.08, limb: 0.86 } : { sh: 1, hip: 1, limb: 1 }
  if (look.child) {
    // Børn: relativt større hoved og kortere ben.
    return { H, hipY: H * 0.48, hipW: H * 0.05 * f.hip, thigh: H * 0.23, shin: H * 0.22, footL: H * 0.14, torsoH: H * 0.29,
      shoulderW: H * 0.105 * f.sh, upperArm: H * 0.17, foreArm: H * 0.15, headR: H * 0.08, limbR: H * 0.04 * f.limb }
  }
  return { H, hipY: H * 0.52, hipW: H * 0.047 * f.hip, thigh: H * 0.25, shin: H * 0.24, footL: H * 0.14, torsoH: H * 0.3,
    shoulderW: H * 0.11 * f.sh, upperArm: H * 0.18, foreArm: H * 0.16, headR: H * 0.063, limbR: H * 0.037 * f.limb }
}

/** Hierarkisk biped (hofte → lår → knæ → fod, skulder → overarm → albue) med udskiftelig krop og gangstil. */
export function Biped({ style, gait, walk = true, look = STEPHAN, speedRef, flailRef }: {
  style: BodyStyle; gait: GaitStyle; walk?: boolean; look?: Look; speedRef?: { current: number }; flailRef?: { current: boolean }
}) {
  const mouth = useRef<THREE.Object3D>(null)
  const d = useMemo(() => dims(style, look), [style, look])
  const P = look
  const m = useMemo(() => {
    const flat = style === 'lowpoly'
    return {
      skin: mat(P.skin, 0.6, flat), hair: mat(P.hair, 0.7, flat), beard: mat(P.goatee ?? P.hair, 0.9, flat),
      top: P.pattern === 'plaid' ? plaidMat(P.top, flat) : mat(P.top, 0.85, flat), bottom: mat(P.bottom, 0.85, flat), shoe: mat(P.shoes ?? '#1c1d20', 0.5, flat),
      eye: mat('#141518', 0.2), white: mat('#ffffff', 0.3), sole: mat('#e9e6e0', 0.6, flat),
    }
  }, [style, P])
  const refs = {
    root: useRef<THREE.Group>(null), pelvis: useRef<THREE.Group>(null), torso: useRef<THREE.Group>(null), head: useRef<THREE.Group>(null),
    hip: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)], knee: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)],
    ankle: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)], shoulder: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)],
    elbow: [useRef<THREE.Group>(null), useRef<THREE.Group>(null)],
  }
  const phase = useRef(0)
  const amount = useRef(1)

  useFrame((_, dt) => {
    const target = speedRef ? Math.min(1, speedRef.current / 0.6) : walk && controls.walking ? 1 : 0
    amount.current += (target - amount.current) * Math.min(1, dt * (speedRef ? 6 : 4))
    // Kadence: ~1,8 skridt/s for voksne; tegneseriestil lidt hurtigere.
    phase.current += dt * (speedRef ? 1 : controls.speed) * (gait === 'bouncy' ? 7.5 : 6) * Math.max(0.15, amount.current)
    const flailing = !!flailRef?.current
    const p = flailing ? flailPose(performance.now() / 1000) : gaitPose(phase.current, gait, amount.current)
    if (mouth.current) mouth.current.visible = flailing
    refs.root.current!.position.y = p.bob
    refs.pelvis.current!.rotation.z = p.hipRoll
    refs.torso.current!.rotation.y = p.torsoYaw
    refs.torso.current!.rotation.z = -p.hipRoll * 0.6
    refs.head.current!.rotation.set(p.headPitch, -p.torsoYaw * 0.7, p.hipRoll * 0.3)
    for (const i of [0, 1]) {
      refs.hip[i].current!.rotation.x = p.legs[i].hip
      refs.knee[i].current!.rotation.x = p.legs[i].knee
      refs.ankle[i].current!.rotation.x = p.legs[i].ankle
      refs.shoulder[i].current!.rotation.x = p.arms[i].shoulder
      refs.elbow[i].current!.rotation.x = p.arms[i].elbow
    }
  })

  const Limb = ({ len, r, material }: { len: number; r: number; material: THREE.Material }) =>
    style === 'voxel'
      ? <mesh material={material} position={[0, -len / 2, 0]} castShadow><boxGeometry args={[r * 2.1, len, r * 2.1]} /></mesh>
      : <mesh material={material} position={[0, -len / 2, 0]} castShadow><capsuleGeometry args={[r, Math.max(0.001, len - r * 2), 6, style === 'lowpoly' ? 6 : 14]} /></mesh>

  return (
    <group ref={refs.root}>
      <group ref={refs.pelvis} position={[0, d.hipY, 0]}>
        {/* Bækken */}
        {style === 'voxel'
          ? <mesh material={m.bottom} castShadow><boxGeometry args={[d.hipW * 4.2, d.H * 0.08, d.hipW * 2.5]} /></mesh>
          : <mesh material={m.bottom} position={[0, d.H * 0.01, 0]} scale={[d.hipW + d.limbR * 1.15, d.H * 0.05, d.limbR * 1.5]} castShadow>
              <sphereGeometry args={[1, style === 'lowpoly' ? 10 : 18, style === 'lowpoly' ? 6 : 12]} />
            </mesh>}
        {[0, 1].map((i) => {
          const side = i === 0 ? -1 : 1
          return (
            <group key={i} ref={refs.hip[i]} position={[side * d.hipW, 0, 0]}>
              <Limb len={d.thigh} r={d.limbR * 1.1} material={m.bottom} />
              <group ref={refs.knee[i]} position={[0, -d.thigh, 0]}>
                <Limb len={d.shin} r={d.limbR * 0.9} material={m.bottom} />
                <group ref={refs.ankle[i]} position={[0, -d.shin, 0]}>
                  <Foot style={style} len={d.footL} r={d.limbR} shoe={m.shoe} sole={m.sole} />
                </group>
              </group>
            </group>
          )
        })}
        <group ref={refs.torso}>
          <Torso style={style} d={d} m={m} feminine={!!look.feminine} />
          {[0, 1].map((i) => {
            const side = i === 0 ? -1 : 1
            return (
              <group key={i} ref={refs.shoulder[i]} position={[side * d.shoulderW, d.torsoH * 0.92, 0]}>
                <group rotation={[0, 0, side * 0.08]}>
                  <Limb len={d.upperArm} r={d.limbR * 0.72} material={m.top} />
                  <group ref={refs.elbow[i]} position={[0, -d.upperArm, 0]}>
                    <Limb len={d.foreArm} r={d.limbR * 0.6} material={m.skin} />
                    {style === 'voxel'
                      ? <mesh material={m.skin} position={[0, -d.foreArm - 0.03, 0]}><boxGeometry args={[0.07, 0.07, 0.07]} /></mesh>
                      : <mesh material={m.skin} position={[0, -d.foreArm - d.limbR * 0.4, 0]}><sphereGeometry args={[d.limbR * (style === 'toy' ? 1.1 : 0.7), 12, 10]} /></mesh>}
                  </group>
                </group>
              </group>
            )
          })}
          {/* Hals (voxel; de øvrige stile har halsen i torsoen) */}
          {style === 'voxel' && <mesh material={m.skin} position={[0, d.torsoH + d.H * 0.025 + 0.02, 0]} castShadow><boxGeometry args={[d.headR * 0.85, d.H * 0.05 + 0.02, d.headR * 0.85]} /></mesh>}
          <group ref={refs.head} position={[0, d.torsoH + (style === 'voxel' ? d.H * 0.05 + 0.02 + d.headR * 1.1 : d.headR * (style === 'toy' ? 0.85 : 1.25)), 0]}>
            <Head style={style} r={d.headR} m={m} look={look} />
            {/* Overrasket "O"-mund, vises kun når figuren bliver løftet */}
            <mesh ref={mouth} visible={false} material={m.eye}
              position={style === 'voxel' ? [0, -d.headR * 0.55, d.headR * 1.06] : [0, -d.headR * 0.42, d.headR * 0.9]}
              scale={[1, 1.35, style === 'voxel' ? 0.3 : 0.6]}>
              <sphereGeometry args={[d.headR * (style === 'voxel' ? 0.2 : 0.16), 12, 10]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

function Foot({ style, len, r, shoe, sole }: { style: BodyStyle; len: number; r: number; shoe: THREE.Material; sole: THREE.Material }) {
  if (style === 'voxel') return <mesh material={shoe} position={[0, -0.03, len * 0.25]}><boxGeometry args={[r * 2.2, 0.07, len]} /></mesh>
  return (
    <group position={[0, -r * 0.4, len * 0.3]}>
      <RoundedBox args={[r * 2, r * 1.1, len]} radius={r * 0.45} smoothness={style === 'lowpoly' ? 1 : 3} material={shoe} castShadow />
      <mesh material={sole} position={[0, -r * 0.5, 0]}><boxGeometry args={[r * 2.02, r * 0.18, len * 0.98]} /></mesh>
    </group>
  )
}

function Torso({ style, d, m, feminine }: { style: BodyStyle; d: Dims; m: Record<string, THREE.Material>; feminine: boolean }) {
  if (style === 'voxel' && feminine)
    // Bryst/skuldre øverst, smallere talje, og skjorten flarer let ud over hofterne.
    return (
      <group>
        <mesh material={m.top} position={[0, d.torsoH * 0.72 + 0.02, 0]} castShadow><boxGeometry args={[d.shoulderW * 2.15, d.torsoH * 0.56, d.hipW * 2.7]} /></mesh>
        <mesh material={m.top} position={[0, d.torsoH * 0.32 + 0.02, 0]} castShadow><boxGeometry args={[d.shoulderW * 1.7, d.torsoH * 0.3, d.hipW * 2.3]} /></mesh>
        <mesh material={m.top} position={[0, d.torsoH * 0.1 + 0.02, 0]} castShadow><boxGeometry args={[d.hipW * 4.3, d.torsoH * 0.16, d.hipW * 2.6]} /></mesh>
      </group>
    )
  if (style === 'voxel')
    return <mesh material={m.top} position={[0, d.torsoH / 2 + 0.02, 0]} castShadow><boxGeometry args={[d.shoulderW * 2.2, d.torsoH + 0.04, d.hipW * 2.6]} /></mesh>
  if (style === 'toy')
    return <mesh material={m.top} position={[0, d.torsoH * 0.5, 0]} scale={[1, 1, 0.8]} castShadow><capsuleGeometry args={[d.shoulderW * 0.85, d.torsoH * 0.35, 8, 20]} /></mesh>
  return (
    <group>
      <mesh material={m.top} position={[0, d.torsoH * 0.48, 0]} scale={[1, 1, 0.62]} castShadow>
        <capsuleGeometry args={[d.shoulderW * 0.85, d.torsoH * 0.55, 6, style === 'lowpoly' ? 7 : 18]} />
      </mesh>
      <mesh material={m.top} position={[0, d.torsoH * 0.92, 0]} scale={[1.5, 0.5, 0.7]} castShadow>
        <sphereGeometry args={[d.shoulderW * 0.72, style === 'lowpoly' ? 8 : 18, style === 'lowpoly' ? 5 : 12]} />
      </mesh>
      <mesh material={m.skin} position={[0, d.torsoH * 1.08, 0]}><cylinderGeometry args={[d.headR * 0.42, d.headR * 0.48, d.H * 0.06, 12]} /></mesh>
    </group>
  )
}

function Head({ style, r, m, look }: { style: BodyStyle; r: number; m: Record<string, THREE.Material>; look: Look }) {
  const parts: ReactNode[] = []
  if (style === 'voxel') {
    const s = r * 2.1
    return (
      <group>
        <mesh material={m.skin} castShadow><boxGeometry args={[s, s * 1.05, s]} /></mesh>
        <VoxelHair look={look} s={s} m={m.hair} />
        {look.goatee && <mesh material={m.beard} position={[0, -s * 0.44, s * 0.48]}><boxGeometry args={[s * 0.32, s * 0.2, s * 0.12]} /></mesh>}
        {[-1, 1].map((x) => <mesh key={x} material={m.eye} position={[x * s * 0.2, s * 0.05, s * 0.505]}><boxGeometry args={[s * 0.12, s * 0.14, 0.01]} /></mesh>)}
      </group>
    )
  }
  const seg = style === 'lowpoly' ? 10 : 28
  parts.push(<mesh key="h" material={m.skin} scale={[0.9, 1.08, 0.98]} castShadow><sphereGeometry args={[r, seg, Math.round(seg * 0.7)]} /></mesh>)
  // Skæg der dækker kæbe/kinder
  if (look.goatee) parts.push(<mesh key="b" material={m.beard} position={[0, -r * 0.82, r * 0.5]} scale={[0.8, 0.9, 0.7]}><sphereGeometry args={[r * 0.24, 12, 10]} /></mesh>)
  // Hår: kort og pjusket (tuer)
  parts.push(<mesh key="cap" material={m.hair} position={[0, r * 0.15, -r * 0.05]} scale={[0.95, 1, 1.02]}><sphereGeometry args={[r * 1.03, seg, 12, 0, Math.PI * 2, 0, Math.PI * 0.46]} /></mesh>)
  const hs = look.hairStyle
  if (hs === 'long') {
    parts.push(<mesh key="lb" material={m.hair} position={[0, -r * 0.55, -r * 0.45]} scale={[1, 1, 0.55]}><capsuleGeometry args={[r * 0.95, r * 1.6, 6, seg]} /></mesh>)
    for (const x of [-1, 1]) parts.push(<mesh key={`ls${x}`} material={m.hair} position={[x * r * 0.86, -r * 0.45, r * 0.05]} scale={[0.35, 1, 0.6]}><capsuleGeometry args={[r * 0.5, r * 1.3, 4, 10]} /></mesh>)
  }
  if (hs === 'ponytail') {
    parts.push(<mesh key="pk" material={m.hair} position={[0, r * 0.3, -r * 1.0]}><sphereGeometry args={[r * 0.26, 10, 8]} /></mesh>)
    parts.push(<mesh key="pt" material={m.hair} position={[0, -r * 0.35, -r * 1.1]} rotation={[0.2, 0, 0]}><capsuleGeometry args={[r * 0.22, r * 1.1, 4, 10]} /></mesh>)
  }
  const tufts = hs === 'short' ? (style === 'toy' ? 9 : 14) : hs === 'messy' ? 10 : 0
  for (let i = 0; i < tufts; i++) {
    const a = (i / tufts) * Math.PI * 2 * 1.6, rr = Math.sqrt(i / tufts) * 0.7
    parts.push(<mesh key={`t${i}`} material={m.hair} position={[Math.cos(a) * rr * r, r * (0.95 - rr * 0.3), Math.sin(a) * rr * r * 0.9 + r * 0.05]}
      rotation={[Math.sin(a) * rr * 0.7, 0, -Math.cos(a) * rr * 0.7]}><coneGeometry args={[r * 0.17, r * 0.4, style === 'lowpoly' ? 4 : 7]} /></mesh>)
  }
  // Øjne: tegneseriestil får store øjne med glimt
  if (style === 'toy') {
    for (const x of [-1, 1]) {
      parts.push(<mesh key={`e${x}`} material={m.eye} position={[x * r * 0.32, r * 0.08, r * 0.86]} scale={[0.8, 1.1, 0.4]}><sphereGeometry args={[r * 0.14, 16, 12]} /></mesh>)
      parts.push(<mesh key={`g${x}`} material={m.white} position={[x * r * 0.32 + r * 0.04, r * 0.14, r * 0.92]}><sphereGeometry args={[r * 0.04, 8, 6]} /></mesh>)
    }
    parts.push(<mesh key="blush1" material={mat('#f29a8a', 0.9)} position={[-r * 0.55, -r * 0.12, r * 0.75]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[r * 0.12, 10, 8]} /></mesh>)
    parts.push(<mesh key="blush2" material={mat('#f29a8a', 0.9)} position={[r * 0.55, -r * 0.12, r * 0.75]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[r * 0.12, 10, 8]} /></mesh>)
  } else {
    for (const x of [-1, 1]) parts.push(<mesh key={`e${x}`} material={m.eye} position={[x * r * 0.33, r * 0.12, r * 0.88]}><sphereGeometry args={[r * 0.08, 10, 8]} /></mesh>)
    parts.push(<mesh key="nose" material={m.skin} position={[0, -r * 0.05, r * 0.95]} scale={[0.6, 1, 0.8]}><sphereGeometry args={[r * 0.15, 10, 8]} /></mesh>)
  }
  for (const x of [-1, 1]) parts.push(<mesh key={`ear${x}`} material={m.skin} position={[x * r * 0.9, 0, 0]} scale={[0.4, 1, 0.7]}><sphereGeometry args={[r * 0.22, 10, 8]} /></mesh>)
  return <group>{parts}</group>
}

/** Voxel-frisurer: kort (top + bagside), pjusket (ekstra tuer), langt (ned over ryggen) og hestehale. */
function VoxelHair({ look, s, m }: { look: Look; s: number; m: THREE.Material }) {
  const cap = <mesh material={m} position={[0, s * 0.45, -s * 0.05]}><boxGeometry args={[s * 1.08, s * 0.25, s * 1.02]} /></mesh>
  const backPlate = (h: number, y: number) => <mesh material={m} position={[0, y, -s * 0.48]}><boxGeometry args={[s * 1.06, h, s * 0.1]} /></mesh>
  switch (look.hairStyle) {
    case 'messy':
      return (
        <group>
          {cap}{backPlate(s * 0.6, s * 0.15)}
          {[[-0.3, 0.6, 0.2], [0.15, 0.62, -0.1], [0.35, 0.58, 0.3], [-0.1, 0.6, 0.38]].map(([x, y, z], i) => (
            <mesh key={i} material={m} position={[x * s, y * s, z * s]}><boxGeometry args={[s * 0.25, s * 0.18, s * 0.25]} /></mesh>
          ))}
          <mesh material={m} position={[0, s * 0.3, s * 0.48]}><boxGeometry args={[s * 0.9, s * 0.12, s * 0.08]} /></mesh>
        </group>
      )
    case 'long':
      return (
        <group>
          {cap}{backPlate(s * 1.5, -s * 0.2)}
          {[-1, 1].map((x) => <mesh key={x} material={m} position={[x * s * 0.53, -s * 0.05, -s * 0.05]}><boxGeometry args={[s * 0.1, s * 0.9, s * 0.95]} /></mesh>)}
        </group>
      )
    case 'ponytail':
      return (
        <group>
          {cap}{backPlate(s * 0.6, s * 0.15)}
          <mesh material={m} position={[0, s * 0.25, -s * 0.62]}><boxGeometry args={[s * 0.3, s * 0.3, s * 0.25]} /></mesh>
          <mesh material={m} position={[0, -s * 0.15, -s * 0.66]}><boxGeometry args={[s * 0.22, s * 0.6, s * 0.2]} /></mesh>
        </group>
      )
    default:
      return <group>{cap}{backPlate(s * 0.6, s * 0.15)}</group>
  }
}

const plaidCache = new Map<string, THREE.MeshStandardMaterial>()
/** Skovmandsskjorte: rød/sort "buffalo"-tern med fine lysere tråde. */
function plaidMat(base: string, flat: boolean) {
  const key = base + flat
  let m = plaidCache.get(key)
  if (m) return m
  const c = document.createElement('canvas'); c.width = c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = 'rgba(20,18,18,0.55)'; ctx.fillRect(0, 0, 32, 64)
  ctx.fillStyle = 'rgba(20,18,18,0.55)'; ctx.fillRect(0, 0, 64, 32)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  for (const v of [15, 47]) { ctx.fillRect(v, 0, 2, 64); ctx.fillRect(0, v, 64, 2) }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2)
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, flatShading: flat })
  plaidCache.set(key, m)
  return m
}
