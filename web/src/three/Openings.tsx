import { useFrame } from '@react-three/fiber'
import { Fragment, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { toggleDoor, useStore } from '../store'
import type { House, P2, WallMode } from '../types'
import { ClipBelow, useClip } from './clip'
import { Clickable, toggleProps } from './interact'
import { layoutWalls, wallTop, type PlacedOpening, type WallSegment } from './layout'
import { QUALITY } from './quality'
import { StaticBatch } from './StaticBatch'

const F = 0.055 // rammebredde
const GAP = 0.003

/** Vinduer, glasdøre, hoveddør, garageporte og indvendige døre placeret i vægåbningerne. */
export function Openings({ house, mode, cam }: { house: House; mode: WallMode; cam: P2 }) {
  const batch = QUALITY[useStore((s) => s.quality)].batch
  return (
    <StaticBatch enabled={batch}>
      {layoutWalls(house).map((seg) => {
        const top = wallTop(seg, mode, house.wallHeight, cam)
        return seg.openings.map((op) => <OpeningMesh key={op.o.id} seg={seg} op={op} top={top} full={house.wallHeight} />)
      })}
    </StaticBatch>
  )
}

/**
 * Åbningens indhold bygges altid i sin rigtige størrelse — også når væggen er skåret ned. Er væggen lav,
 * klippes indholdet vandret i væghøjden med `<ClipBelow>`, så fx en glasdør og en garageport ser ens ud i
 * alle visningstilstande og blot er savet over i snitfladen.
 */
function OpeningMesh({ seg, op, top, full }: { seg: WallSegment; op: PlacedOpening; top: number; full: number }) {
  const x = seg.a[0] + seg.dir[0] * op.s
  const z = seg.a[1] + seg.dir[1] * op.s
  const rotY = Math.atan2(-seg.dir[1], seg.dir[0])
  const out = seg.outward // lokal +z peger ud for ydervægge når out = 1
  if (top <= op.sill + 0.02) return null // hele åbningen ligger over snitfladen
  // Karme/rammer rykkes GAP ind fra murens lysning, så deres flader aldrig ligger i samme plan som muren (z-fighting).
  const props = {
    id: op.o.id, w: op.o.width - 2 * GAP, sill: op.sill + GAP, head: op.head - GAP,
    t: seg.thickness, out, leaves: op.o.leaves ?? 1,
  }

  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <ClipBelow y={top >= full ? Infinity : top}>
        {(() => {
          switch (op.o.type) {
            case 'window': return <GlazedUnit {...props} isDoor={false} />
            case 'glassDoor':
            case 'exteriorDoor': return <GlazedDoor {...props} />
            case 'slidingDoor': return <SlidingDoor {...props} />
            case 'frontDoor': return <FrontDoor {...props} />
            case 'garageDoor': return <GarageDoor {...props} />
            case 'fireplace': return <Fireplace {...props} />
            case 'frenchDoor': return <InteriorDoor {...props} glazed />
            default: return <InteriorDoor {...props} />
          }
        })()}
      </ClipBelow>
    </group>
  )
}

type P = { id: string; w: number; sill: number; head: number; t: number; out: 1 | -1; leaves: number }

function GlazedUnit({ w, sill, head, t, out, leaves, isDoor }: P & { isDoor: boolean }) {
  const { m } = useClip()
  const zf = out * (t / 2 - 0.09)
  const h = head - sill
  const n = isDoor ? Math.max(leaves, 1) : w > 1.15 ? 2 : 1
  const mullions = Array.from({ length: n - 1 }, (_, i) => -w / 2 + ((i + 1) * w) / n)
  const bottomF = isDoor ? 0.08 : F
  return (
    <group>
      {/* Karm */}
      <mesh material={m.frame} position={[-w / 2 + F / 2, sill + h / 2, zf]} castShadow><boxGeometry args={[F, h, 0.08]} /></mesh>
      <mesh material={m.frame} position={[w / 2 - F / 2, sill + h / 2, zf]} castShadow><boxGeometry args={[F, h, 0.08]} /></mesh>
      <mesh material={m.frame} position={[0, sill + bottomF / 2, zf]} castShadow><boxGeometry args={[w, bottomF, 0.08]} /></mesh>
      <mesh material={m.frame} position={[0, head - F / 2, zf]} castShadow><boxGeometry args={[w, F, 0.08]} /></mesh>
      {mullions.map((mx) => (
        <mesh key={mx} material={m.frame} position={[mx, sill + h / 2, zf]} castShadow><boxGeometry args={[F * 1.4, h, 0.07]} /></mesh>
      ))}
      <mesh material={m.glass} position={[0, sill + h / 2, zf]}><boxGeometry args={[w - 0.02, h - 0.02, 0.012]} /></mesh>
      {/* Zinksålbænk ude, hvid indvendig bundstykke for vinduer */}
      {!isDoor && (
        <Fragment>
          <mesh material={m.zinc} position={[0, sill - 0.015, out * (t / 2 + 0.02)]} castShadow><boxGeometry args={[w + 0.06, 0.03, 0.16]} /></mesh>
          <mesh material={m.whiteFrame} position={[0, sill - 0.01, -out * (t / 2 - 0.12)]}><boxGeometry args={[w, 0.02, 0.2]} /></mesh>
        </Fragment>
      )}
      {isDoor && (
        <mesh material={m.zinc} position={[w / 2 - 0.16, 1.02, zf - out * 0.06]}><boxGeometry args={[0.025, 0.2, 0.03]} /></mesh>
      )}
    </group>
  )
}

/** Hoveddør. Som alle yderdøre åbner den ud (væk fra huset). */
function FrontDoor({ id, w, head, t, out }: P) {
  const { m } = useClip()
  const zf = out * (t / 2 - 0.09)
  const h = Math.min(head, 2.2)
  const leafW = w - 2 * F
  return (
    <group>
      <mesh material={m.frame} position={[-w / 2 + F / 2, head / 2, zf]}><boxGeometry args={[F, head, 0.09]} /></mesh>
      <mesh material={m.frame} position={[w / 2 - F / 2, head / 2, zf]}><boxGeometry args={[F, head, 0.09]} /></mesh>
      <mesh material={m.frame} position={[0, head - F / 2, zf]}><boxGeometry args={[w, F, 0.09]} /></mesh>
      <HingedLeaf id={id} hinge={[-w / 2 + F, (h - F) / 2, zf]} side={1} width={leafW} swing={out}>
        <mesh material={m.garageDoor} position={[0, 0, out * 0.012]} castShadow><boxGeometry args={[leafW, h - F, 0.04]} /></mesh>
        <mesh material={m.whiteFrame} position={[0, 0, -out * 0.017]}><boxGeometry args={[leafW, h - F, 0.02]} /></mesh>
        <LeverHandles x={leafW / 2 - 0.08} y={Math.min(1.05, h - F - 0.1) - (h - F) / 2} t={0.08} dir={-1} />
        {h > 1.6 && <mesh material={m.zinc} position={[0, 0.25, out * 0.033]}><boxGeometry args={[0.3, 0.04, 0.004]} /></mesh>}
        <Hinges x={-leafW / 2} h={h - F} />
      </HingedLeaf>
    </group>
  )
}

const OPEN_SECONDS = 3.5
const SECTIONS = 5
const TRACK_RADIUS = 0.35

/**
 * Ledport (sektionsport): sektionerne kører op ad lodrette skinner, bøjer om i en kvart cirkel
 * og fortsætter vandret langs loftet ind i garagen. Åben/lukket styres af serveren.
 */
function GarageDoor({ id, w, head, t, out }: P) {
  const { m } = useClip()
  const open = useStore((s) => s.snapshot?.openDoors.includes(id) ?? false)
  const sections = useRef<(THREE.Group | null)[]>([])
  const f = useRef(open ? 1 : 0)
  const zf = out * (t / 2 - 0.1)
  const sh = head / SECTIONS
  const r = TRACK_RADIUS
  const arc = (Math.PI / 2) * r
  const inward = -out

  /** Punkt og hældning på skinnen ved buelængde s (målt fra gulvet). */
  const track = (s: number) => {
    if (s <= head) return { y: s, z: 0, a: 0 }
    if (s <= head + arc) {
      const phi = (s - head) / r
      return { y: head + r * Math.sin(phi), z: inward * r * (1 - Math.cos(phi)), a: phi }
    }
    return { y: head + r, z: inward * (r + (s - head - arc)), a: Math.PI / 2 }
  }

  useFrame((_, dt) => {
    const target = open ? 1 : 0
    f.current += THREE.MathUtils.clamp(target - f.current, -dt / OPEN_SECONDS, dt / OPEN_SECONDS)
    const eased = f.current * f.current * (3 - 2 * f.current)
    const shift = eased * (head + 0.05)
    for (let i = 0; i < SECTIONS; i++) {
      const g = sections.current[i]
      if (!g) continue
      const p = track((i + 0.5) * sh + shift)
      g.position.set(0, p.y, zf + p.z)
      g.rotation.x = inward * p.a
    }
  })

  const rail = (
    <>
      <boxGeometry args={[0.04, head, 0.06]} />
    </>
  )
  const depth = head + 0.3
  return (
    // Klik hvor som helst på porten (eller skinnerne) åbner/lukker den — der er ingen knap.
    <Clickable onActivate={() => toggleDoor(id)}>
      {Array.from({ length: SECTIONS }, (_, i) => (
        <group key={i} ref={(g) => { sections.current[i] = g }} userData={{ dynamic: true }}>
          <mesh material={m.garageDoor} castShadow receiveShadow><boxGeometry args={[w, sh - 0.006, 0.045]} /></mesh>
          {/* Indersiden er hvid — set fra garagen, og nedefra når porten ligger langs loftet */}
          <mesh material={m.whiteFrame} position={[0, 0, -out * 0.0245]}><boxGeometry args={[w - 0.004, sh - 0.008, 0.004]} /></mesh>
          <mesh material={m.frame} position={[0, -sh / 2 + 0.004, out * 0.024]}><boxGeometry args={[w - 0.02, 0.01, 0.006]} /></mesh>
        </group>
      ))}
      {/* Skinner: lodret i hver side, og vandret langs loftet ind i garagen */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (w / 2 + 0.03), 0, zf + inward * 0.04]}>
          <mesh material={m.zinc} position={[0, head / 2, 0]}>{rail}</mesh>
          <mesh material={m.zinc} position={[0, head + r, inward * (r + depth / 2)]}><boxGeometry args={[0.04, 0.06, depth]} /></mesh>
        </group>
      ))}
      {/* Udvendig væglampe som på fotoene */}
      <mesh material={m.frame} position={[0, head + 0.35, out * (t / 2 + 0.04)]}><boxGeometry args={[0.08, 0.16, 0.08]} /></mesh>
    </Clickable>
  )
}

function InteriorDoor({ id, w, head, t, leaves, glazed = false }: P & { glazed?: boolean }) {
  const leafH = Math.min(2.03, head - 0.02)
  const leafW = (w - 0.06) / leaves
  return (
    <group>
      <Casings w={w} head={head} t={t} />
      {Array.from({ length: leaves }, (_, i) => (
        <HingedLeaf key={i} id={id} hinge={[i === 0 ? -w / 2 + 0.03 : w / 2 - 0.03, leafH / 2, 0]} side={i === 0 ? 1 : -1} width={leafW} swing={1}>
          {glazed
            ? <><group rotation={[0, Math.PI / 2, 0]}><GlazedLeaf h={leafH} w={leafW} /></group>
                <LeverHandles x={(i === 0 ? 1 : -1) * (leafW / 2 - 0.06)} y={Math.min(1.05, leafH - 0.1) - leafH / 2} t={0.04} dir={i === 0 ? -1 : 1} />
                <Hinges x={(i === 0 ? -1 : 1) * (leafW / 2)} h={leafH} /></>
            : <DoorLeaf w={leafW} h={leafH} freeSide={i === 0 ? 1 : -1} />}
        </HingedLeaf>
      ))}
    </group>
  )
}

/** Hvide gerigter på begge sider af en indvendig døråbning. */
function Casings({ w, head, t, casing = 0.07 }: { w: number; head: number; t: number; casing?: number }) {
  const { m } = useClip()
  return (
    <>
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh material={m.whiteFrame} position={[-w / 2 - casing / 2 + 0.01, head / 2, side * (t / 2 + 0.0095)]}><boxGeometry args={[casing, head, 0.015]} /></mesh>
          <mesh material={m.whiteFrame} position={[w / 2 + casing / 2 - 0.01, head / 2, side * (t / 2 + 0.0095)]}><boxGeometry args={[casing, head, 0.015]} /></mesh>
          {head >= 2.08 && <mesh material={m.whiteFrame} position={[0, head + casing / 2 - 0.01, side * (t / 2 + 0.0095)]}><boxGeometry args={[w + 2 * casing - 0.02, casing, 0.015]} /></mesh>}
        </group>
      ))}
    </>
  )
}

const DOOR_SECONDS = 0.9

/** Blød 0→1 værdi for hvor åben en dør er (mål: serverens openDoors). */
function useDoorOpenness(id: string) {
  const open = useStore((st) => st.snapshot?.openDoors.includes(id) ?? false)
  const f = useRef(open ? 1 : 0)
  return (dt: number) => {
    f.current += THREE.MathUtils.clamp((open ? 1 : 0) - f.current, -dt / DOOR_SECONDS, dt / DOOR_SECONDS)
    return f.current * f.current * (3 - 2 * f.current)
  }
}

/**
 * Dørblad hængslet i `hinge`. Lukket ligger bladet i vægplanet og strækker sig mod `side` (+1 = +x, -1 = -x);
 * åbent er det drejet 90° ud mod `swing` (+1 = lokal +z-side af væggen).
 */
function HingedLeaf({ id, hinge, side, width, swing, children }: {
  id: string; hinge: [number, number, number]; side: 1 | -1; width: number; swing: number; children: React.ReactNode
}) {
  const g = useRef<THREE.Group>(null)
  const step = useDoorOpenness(id)
  const target = side === 1 ? -swing * (Math.PI / 2) : swing * (Math.PI / 2)
  useFrame((_, dt) => { if (g.current) g.current.rotation.y = target * step(dt) })
  return (
    <group ref={g} position={hinge} userData={{ dynamic: true }}>
      <group position={[(side * width) / 2, 0, 0]} {...toggleProps(id)}>{children}</group>
    </group>
  )
}

/** Skydedør der kører ind i væggen (lommedør) mod -x. */
function SlidingDoor({ id, w, head, t }: P) {
  const { m, clip } = useClip()
  const leafH = Math.min(2.03, head - 0.02)
  const leafW = w - 0.02
  const g = useRef<THREE.Group>(null)
  const step = useDoorOpenness(id)
  useFrame((_, dt) => { if (g.current) g.current.position.x = -step(dt) * (leafW - 0.06) })
  return (
    <group>
      <Casings w={w} head={head} t={t} />
      <group ref={g} userData={{ dynamic: true }}>
        <mesh material={m.whiteFrame} position={[0, leafH / 2, 0]} castShadow {...toggleProps(id)}><boxGeometry args={[leafW, leafH, 0.035]} /></mesh>
        {[1, -1].map((sd) => (
          <mesh key={sd} material={clip(handleMat)} position={[leafW / 2 - 0.07, Math.min(1.05, leafH - 0.1), sd * 0.0178]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.002, 24]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * Glasdør i ydervæg (terrasse- og havedøre m.m.): fast karm + hængslede glasblade.
 * Yderdøre åbner altid ud mod haven, så de ikke tager plads i rummet (`swing = out`).
 */
function GlazedDoor({ id, w, sill, head, t, out, leaves }: P) {
  const { m } = useClip()
  const zf = out * (t / 2 - 0.09)
  const h = head - sill
  const n = Math.max(leaves, 1)
  const leafW = (w - 2 * F) / n
  return (
    <group>
      <mesh material={m.frame} position={[-w / 2 + F / 2, sill + h / 2, zf]} castShadow><boxGeometry args={[F, h, 0.08]} /></mesh>
      <mesh material={m.frame} position={[w / 2 - F / 2, sill + h / 2, zf]} castShadow><boxGeometry args={[F, h, 0.08]} /></mesh>
      <mesh material={m.frame} position={[0, head - F / 2, zf]} castShadow><boxGeometry args={[w, F, 0.08]} /></mesh>
      {Array.from({ length: n }, (_, i) => (
        <HingedLeaf key={i} id={id} hinge={[i === 0 ? -w / 2 + F : w / 2 - F, sill + h / 2, zf]} side={i === 0 ? 1 : -1} width={leafW} swing={out}>
          <mesh material={m.frame} position={[0, -h / 2 + 0.05, 0]} castShadow><boxGeometry args={[leafW, 0.1, 0.06]} /></mesh>
          <mesh material={m.frame} position={[0, h / 2 - F * 1.5, 0]} castShadow><boxGeometry args={[leafW, F, 0.06]} /></mesh>
          {[-1, 1].map((sx) => <mesh key={sx} material={m.frame} position={[sx * (leafW / 2 - 0.025), 0, 0]} castShadow><boxGeometry args={[0.05, h - 0.02, 0.06]} /></mesh>)}
          <mesh material={m.glass}><boxGeometry args={[leafW - 0.06, h - 0.12, 0.012]} /></mesh>
          {h > 1.2 && <LeverHandles x={(i === 0 ? 1 : -1) * (leafW / 2 - 0.05)} y={1.05 - sill - h / 2} t={0.06} dir={i === 0 ? -1 : 1} />}
        </HingedLeaf>
      ))}
    </group>
  )
}

/**
 * Fransk dørblad: hvid ramme med tre glasruder over hinanden (som dørene på fotoet fra entréen).
 * Lokalt: bladet ligger i yz-planet (tykkelse langs x), centreret i origo.
 */
function GlazedLeaf({ h, w }: { h: number; w: number }) {
  const { m } = useClip()
  const stile = 0.075, rail = 0.075, bottom = 0.16, th = 0.04
  const panes = 3
  const paneH = (h - rail - bottom - (panes - 1) * rail) / panes
  return (
    <group>
      {/* Lodrette sidetræer */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.whiteFrame} position={[0, 0, s * (w / 2 - stile / 2)]} castShadow><boxGeometry args={[th, h, stile]} /></mesh>
      ))}
      {/* Top-, bund- og mellemrammer */}
      <mesh material={m.whiteFrame} position={[0, h / 2 - rail / 2, 0]} castShadow><boxGeometry args={[th, rail, w - 2 * stile]} /></mesh>
      <mesh material={m.whiteFrame} position={[0, -h / 2 + bottom / 2, 0]} castShadow><boxGeometry args={[th, bottom, w - 2 * stile]} /></mesh>
      {Array.from({ length: panes - 1 }, (_, i) => {
        const y = -h / 2 + bottom + (i + 1) * paneH + i * rail + rail / 2
        return <mesh key={i} material={m.whiteFrame} position={[0, y, 0]} castShadow><boxGeometry args={[th, rail, w - 2 * stile]} /></mesh>
      })}
      {/* Glas */}
      {Array.from({ length: panes }, (_, i) => {
        const y = -h / 2 + bottom + i * (paneH + rail) + paneH / 2
        return <mesh key={`g${i}`} material={m.doorGlass} position={[0, y, 0]}><boxGeometry args={[0.012, paneH, w - 2 * stile]} /></mesh>
      })}
    </group>
  )
}

let flameTexture: THREE.CanvasTexture | null = null
/** Dråbeformet flamme-sprite: hvid-gul kerne, orange midte og rød, gennemsigtig kant. */
function getFlameTexture() {
  if (flameTexture) return flameTexture
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 92, 2, 32, 80, 60)
  g.addColorStop(0, 'rgba(255,250,220,1)')
  g.addColorStop(0.25, 'rgba(255,200,80,0.95)')
  g.addColorStop(0.55, 'rgba(255,110,20,0.6)')
  g.addColorStop(1, 'rgba(200,40,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(32, 2)
  ctx.bezierCurveTo(52, 50, 62, 80, 50, 110)
  ctx.quadraticCurveTo(32, 128, 14, 110)
  ctx.bezierCurveTo(2, 80, 12, 50, 32, 2)
  ctx.fill()
  flameTexture = new THREE.CanvasTexture(c)
  flameTexture.colorSpace = THREE.SRGBColorSpace
  return flameTexture
}

/**
 * Gennemsigtig pejs indbygget i væggen: sort brændkammer med glas på begge sider, brænde og animerede
 * flammer. Tændt/slukket deles via serveren (samme mekanisme som garageportene) — klik på pejsen tænder/slukker.
 */
function Fireplace({ id, w, sill, head, t }: P) {
  const lit = useStore((s) => s.snapshot?.openDoors.includes(id) ?? false)
  const { planes } = useClip()
  const h = head - sill
  const mats = useMemo(() => ({
    steel: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.7, metalness: 0.3, clippingPlanes: planes, clipShadows: true }),
    log: new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.95, clippingPlanes: planes, clipShadows: true }),
    ember: new THREE.MeshStandardMaterial({ color: '#2a1408', emissive: '#ff5a10', emissiveIntensity: 0, roughness: 1, clippingPlanes: planes }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#2b2f33', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false, clippingPlanes: planes }),
    flame: new THREE.SpriteMaterial({ map: getFlameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, clippingPlanes: planes }),
  }), [planes])
  const flames = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ x: (i / 6 - 0.5) * (w - 0.3), phase: i * 1.7, size: 0.13 + (i % 3) * 0.035 })), [w])
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  const light = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    const tt = clock.elapsedTime
    flames.forEach((fl, i) => {
      const s = sprites.current[i]
      if (!s) return
      const flicker = 0.75 + 0.25 * Math.sin(tt * 9 + fl.phase) + 0.15 * Math.sin(tt * 23 + fl.phase * 2)
      s.visible = lit
      s.scale.set(fl.size * (0.8 + 0.2 * Math.sin(tt * 7 + fl.phase)), fl.size * 2.2 * flicker, 1)
      s.position.set(fl.x + 0.02 * Math.sin(tt * 5 + fl.phase), sill + 0.09 + (fl.size * 2.2 * flicker) / 2, 0)
    })
    mats.ember.emissiveIntensity = lit ? 1.6 + 0.4 * Math.sin(tt * 3) : 0
    if (light.current) light.current.intensity = lit ? 2.4 + 0.5 * Math.sin(tt * 11) + 0.3 * Math.sin(tt * 27) : 0
  })

  const inner = t - 0.03
  return (
    // Klik på pejsen tænder/slukker den — der er ingen vægkontakt.
    <Clickable onActivate={() => toggleDoor(id)}>
      {/* Brændkammer (sort foring i hullet) */}
      <mesh material={mats.steel} position={[0, sill + 0.01, 0]}><boxGeometry args={[w, 0.02, inner]} /></mesh>
      <mesh material={mats.steel} position={[0, head - 0.01, 0]}><boxGeometry args={[w, 0.02, inner]} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={mats.steel} position={[s * (w / 2 - 0.01), sill + h / 2, 0]}><boxGeometry args={[0.02, h, inner]} /></mesh>
      ))}
      {/* Brænde og gløder */}
      <mesh material={mats.ember} position={[0, sill + 0.025, 0]}><boxGeometry args={[w - 0.2, 0.012, inner * 0.6]} /></mesh>
      {[[-0.12, 0.25], [0.1, -0.3], [0, 0.05]].map(([x, r], i) => (
        <mesh key={i} material={mats.log} position={[x * w, sill + 0.05 + (i === 2 ? 0.04 : 0), 0]} rotation={[0, r, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.04, w * 0.55, 10]} />
        </mesh>
      ))}
      {flames.map((_, i) => <sprite key={i} ref={(s) => { sprites.current[i] = s }} material={mats.flame} />)}
      <pointLight ref={light} position={[0, sill + 0.2, 0]} color="#ff8a3c" intensity={0} distance={7} decay={1.8} />
      {/* Glas med sort ramme på begge sider */}
      {[-1, 1].map((side) => (
        <group key={side} position={[0, sill + h / 2, side * (t / 2 - 0.012)]}>
          <mesh material={mats.glass}><boxGeometry args={[w - 0.04, h - 0.04, 0.006]} /></mesh>
          <mesh material={mats.steel} position={[0, h / 2 - 0.015, 0]}><boxGeometry args={[w, 0.03, 0.02]} /></mesh>
          <mesh material={mats.steel} position={[0, -h / 2 + 0.015, 0]}><boxGeometry args={[w, 0.03, 0.02]} /></mesh>
          {[-1, 1].map((sx) => <mesh key={sx} material={mats.steel} position={[sx * (w / 2 - 0.015), 0, 0]}><boxGeometry args={[0.03, h, 0.02]} /></mesh>)}
        </group>
      ))}
    </Clickable>
  )
}

const handleMat = new THREE.MeshStandardMaterial({ color: '#c8cbce', roughness: 0.28, metalness: 1 })
const hingeMat = new THREE.MeshStandardMaterial({ color: '#b9bcbf', roughness: 0.35, metalness: 1 })

/**
 * Glat hvidt dørblad med to fræsede fyldinger på hver side, greb på den frie kant og hængsler på den anden.
 * Lokalt: centreret, bredde langs x, tykkelse langs z. `freeSide` = den side (±x) grebet sidder i.
 */
function DoorLeaf({ w, h, freeSide }: { w: number; h: number; freeSide: 1 | -1 }) {
  const { m, planes } = useClip()
  const T = 0.04
  const groove = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e4e3df', roughness: 0.5, clippingPlanes: planes }), [planes])
  const inset = 0.11, gap = 0.12
  // To fyldinger (øverst stor, nederst lavere) markeret med tynde fræsespor på begge flader.
  const panels = h > 1.5
    ? [{ y0: -h / 2 + inset, y1: -h / 2 + inset + (h - 2 * inset - gap) * 0.38 }, { y0: -h / 2 + inset + (h - 2 * inset - gap) * 0.38 + gap, y1: h / 2 - inset }]
    : []
  const line = 0.008
  return (
    <group>
      <mesh material={m.whiteFrame} castShadow receiveShadow><boxGeometry args={[w, h, T]} /></mesh>
      {[1, -1].map((side) => panels.map((p, k) => {
        const pw = w - 2 * inset, ph = p.y1 - p.y0, cy = (p.y0 + p.y1) / 2, z = side * (T / 2 + 0.0006)
        return (
          <group key={side + ':' + k}>
            <mesh material={groove} position={[0, p.y1, z]}><boxGeometry args={[pw, line, 0.001]} /></mesh>
            <mesh material={groove} position={[0, p.y0, z]}><boxGeometry args={[pw, line, 0.001]} /></mesh>
            <mesh material={groove} position={[-pw / 2, cy, z]}><boxGeometry args={[line, ph, 0.001]} /></mesh>
            <mesh material={groove} position={[pw / 2, cy, z]}><boxGeometry args={[line, ph, 0.001]} /></mesh>
          </group>
        )
      }))}
      <LeverHandles x={freeSide * (w / 2 - 0.065)} y={Math.min(1.05, h - 0.1) - h / 2} t={T} dir={-freeSide as 1 | -1} />
      <Hinges x={-freeSide * (w / 2)} h={h} />
    </group>
  )
}

/** Dørgreb (roset + vandret greb) på begge sider af et dørblad med tykkelse t. Grebet peger mod `dir` (±x). */
function LeverHandles({ x, y, t, dir }: { x: number; y: number; t: number; dir: 1 | -1 }) {
  const handle = useClip().clip(handleMat)
  return (
    <group position={[x, y, 0]}>
      {[1, -1].map((side) => (
        <group key={side} position={[0, 0, side * (t / 2)]}>
          <mesh material={handle} position={[0, 0, side * 0.004]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.026, 0.026, 0.008, 24]} /></mesh>
          <mesh material={handle} position={[0, 0, side * 0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.009, 0.009, 0.052, 12]} /></mesh>
          <mesh material={handle} position={[dir * 0.06, 0, side * 0.055]} rotation={[0, 0, Math.PI / 2]} castShadow><capsuleGeometry args={[0.0095, 0.11, 6, 12]} /></mesh>
        </group>
      ))}
    </group>
  )
}

/** Tre hængsler på bladets hængselkant. */
function Hinges({ x, h }: { x: number; h: number }) {
  const hinge = useClip().clip(hingeMat)
  if (h < 1.2) return null
  return (
    <>
      {[h / 2 - 0.2, 0.05, -h / 2 + 0.22].map((y) => (
        <mesh key={y} material={hinge} position={[x, y, 0]}><cylinderGeometry args={[0.009, 0.009, 0.1, 12]} /></mesh>
      ))}
    </>
  )
}
