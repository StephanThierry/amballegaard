import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { House, RoofDef } from '../types'
import { getMaterials } from './materials'
import { MeshBuilder } from './meshBuilder'
import { meterBox } from './util'

const ROOF_T = 0.18
const GABLE_OVERHANG = 0.08
const SEAM_SPACING = 0.52

interface RoofGeo {
  def: RoofDef
  tan: number
  cos: number
  /** Halv spændvidde målt til murens yderside. */
  half: number
  ridgeY: number
  /** Center på tværs (z for ridgeAxis x, x for ridgeAxis z). */
  c: number
  /** Udstrækning langs kippen inkl. udhæng ved gavle. */
  a0: number
  a1: number
}

function roofGeo(house: House, def: RoofDef): RoofGeo {
  const t = house.exteriorWallThickness / 2
  const pitch = (def.pitchDeg * Math.PI) / 180
  const [c0, c1] = def.ridgeAxis === 'x' ? def.z : def.x
  const [a0, a1] = def.ridgeAxis === 'x' ? def.x : def.z
  const half = (c1 - c0) / 2 + t
  return {
    def, tan: Math.tan(pitch), cos: Math.cos(pitch), half,
    ridgeY: house.wallHeight + half * Math.tan(pitch),
    c: (c0 + c1) / 2,
    a0: a0 - (def.gableEnds.includes('min') ? t + GABLE_OVERHANG : 0),
    a1: a1 + (def.gableEnds.includes('max') ? t + GABLE_OVERHANG : 0),
  }
}

/** Tagfladens overside i (x,z), eller null hvis punktet ikke er under dette tag. */
export function roofTopAt(house: House, def: RoofDef, x: number, z: number) {
  const r = roofGeo(house, def)
  const along = def.ridgeAxis === 'x' ? x : z
  const across = def.ridgeAxis === 'x' ? z : x
  if (along < r.a0 || along > r.a1 || Math.abs(across - r.c) > r.half + def.overhang) return null
  return r.ridgeY - Math.abs(across - r.c) * r.tan + ROOF_T / r.cos
}

/** Placerer et objekt på tagfladen: returnerer position + rotation for en side (σ=±1). */
function slopeFrame(r: RoofGeo, side: 1 | -1, along: number, downFromRidge: number, lift: number) {
  const pitch = Math.atan(r.tan)
  const sin = Math.sin(pitch), cos = Math.cos(pitch)
  const across = r.c + side * downFromRidge * cos
  const y = r.ridgeY - downFromRidge * sin + lift * cos
  const acrossLift = side * lift * sin
  if (r.def.ridgeAxis === 'x')
    return { position: new THREE.Vector3(along, y, across + acrossLift), rotation: new THREE.Euler(side * pitch, 0, 0) }
  return { position: new THREE.Vector3(across + acrossLift, y, along), rotation: new THREE.Euler(0, 0, -side * pitch) }
}

function RoofWing({ house, def }: { house: House; def: RoofDef }) {
  const mats = getMaterials()
  const r = useMemo(() => roofGeo(house, def), [house, def])
  const slopeLen = (r.half + def.overhang) / r.cos
  const alongLen = r.a1 - r.a0
  const alongMid = (r.a0 + r.a1) / 2
  const isX = def.ridgeAxis === 'x'

  const panel = useMemo(
    () => (isX ? meterBox(alongLen, ROOF_T, slopeLen) : meterBox(slopeLen, ROOF_T, alongLen)),
    [isX, alongLen, slopeLen])
  const barge = useMemo(() => (isX ? new THREE.BoxGeometry(0.05, 0.3, slopeLen + 0.03) : new THREE.BoxGeometry(slopeLen + 0.03, 0.3, 0.05)), [isX, slopeLen])

  const sides: (1 | -1)[] = [1, -1]
  return (
    <group>
      {sides.map((side) => {
        const f = slopeFrame(r, side, alongMid, slopeLen / 2, ROOF_T / 2)
        return (
          <group key={side}>
            <mesh geometry={panel} material={mats.roof} position={f.position} rotation={f.rotation} castShadow receiveShadow />
            <Seams r={r} side={side} slopeLen={slopeLen} />
            {def.gableEnds.map((end) => {
              const a = end === 'min' ? r.a0 - 0.02 : r.a1 + 0.02
              const bf = slopeFrame(r, side, a, slopeLen / 2, ROOF_T / 2 - 0.04)
              return <mesh key={end} geometry={barge} material={mats.zinc} position={bf.position} rotation={bf.rotation} castShadow />
            })}
            <Gutter r={r} side={side} slopeLen={slopeLen} />
          </group>
        )
      })}
      {/* Kiprygning */}
      <mesh material={mats.zinc} castShadow
        position={isX ? [alongMid, r.ridgeY + ROOF_T / r.cos, r.c] : [r.c, r.ridgeY + ROOF_T / r.cos, alongMid]}>
        <boxGeometry args={isX ? [alongLen, 0.06, 0.22] : [0.22, 0.06, alongLen]} />
      </mesh>
    </group>
  )
}

/** Tagpapbanernes false/lister — instanced. */
function Seams({ r, side, slopeLen }: { r: RoofGeo; side: 1 | -1; slopeLen: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = Math.floor((r.a1 - r.a0) / SEAM_SPACING)
  const mats = getMaterials()
  const geom = useMemo(() => r.def.ridgeAxis === 'x'
    ? new THREE.BoxGeometry(0.03, 0.035, slopeLen)
    : new THREE.BoxGeometry(slopeLen, 0.035, 0.03), [r, slopeLen])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const start = r.a0 + ((r.a1 - r.a0) - (count - 1) * SEAM_SPACING) / 2
    for (let i = 0; i < count; i++) {
      const f = slopeFrame(r, side, start + i * SEAM_SPACING, slopeLen / 2, ROOF_T + 0.0175)
      m.compose(f.position, new THREE.Quaternion().setFromEuler(f.rotation), new THREE.Vector3(1, 1, 1))
      ref.current!.setMatrixAt(i, m)
    }
    ref.current!.instanceMatrix.needsUpdate = true
  }, [r, side, slopeLen, count])

  return <instancedMesh ref={ref} args={[geom, mats.roofSeam, count]} castShadow />
}

function Gutter({ r, side, slopeLen }: { r: RoofGeo; side: 1 | -1; slopeLen: number }) {
  const mats = getMaterials()
  const f = slopeFrame(r, side, (r.a0 + r.a1) / 2, slopeLen + 0.04, -0.02)
  const len = r.a1 - r.a0
  return (
    <mesh material={mats.zinc} position={f.position} rotation={r.def.ridgeAxis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.065, 0.065, len, 12, 1, false]} />
    </mesh>
  )
}

/** Teglgavle-trekanter over væghøjden. */
function Gables({ house }: { house: House }) {
  const mats = getMaterials()
  const geoms = useMemo(() => {
    const mb = new MeshBuilder<'brick'>()
    const t = house.exteriorWallThickness
    for (const def of house.roofs) {
      const r = roofGeo(house, def)
      for (const end of def.gableEnds) {
        const along = end === 'min' ? (def.ridgeAxis === 'x' ? def.x[0] : def.z[0]) : (def.ridgeAxis === 'x' ? def.x[1] : def.z[1])
        const H = house.wallHeight
        const pts: [number, number][] = [[r.c - r.half, H], [r.c + r.half, H], [r.c, r.ridgeY]]
        if (def.ridgeAxis === 'x') mb.prism([along, 0, 0], [0, 0, 1], [-1, 0, 0], pts, t, { plusW: 'brick', minusW: 'brick', edges: 'brick' })
        else mb.prism([0, 0, along], [1, 0, 0], [0, 0, 1], pts, t, { plusW: 'brick', minusW: 'brick', edges: 'brick' })
      }
    }
    return mb.build()
  }, [house])
  return <>{[...geoms].map(([k, g]) => <mesh key={k} geometry={g} material={mats.brick} castShadow receiveShadow />)}</>
}

function Skylights({ house }: { house: House }) {
  const mats = getMaterials()
  return (
    <>
      {house.skylights.map((s, i) => {
        const def = house.roofs.find((r) => r.id === s.roof)!
        const r = roofGeo(house, def)
        const f = slopeFrame(r, 1, s.x, r.half * 0.45 / r.cos, ROOF_T + 0.05)
        const isX = def.ridgeAxis === 'x'
        return (
          <group key={i} position={f.position} rotation={f.rotation}>
            <mesh material={mats.zinc} castShadow>
              <boxGeometry args={isX ? [s.width, 0.1, s.length] : [s.length, 0.1, s.width]} />
            </mesh>
            <mesh material={mats.glass} position={[0, 0.052, 0]}>
              <boxGeometry args={isX ? [s.width - 0.1, 0.01, s.length - 0.1] : [s.length - 0.1, 0.01, s.width - 0.1]} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

/** Overdækket terrasse: zinkklædte bjælker langs tagkanten og teglsøjle i hjørnet. */
function CoveredTerrace({ house }: { house: House }) {
  const mats = getMaterials()
  const [cx, cz] = house.coveredTerrace.column
  const H = house.wallHeight
  const poly = house.coveredTerrace.poly
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const t = house.exteriorWallThickness
  const beamH = 0.42
  return (
    <group>
      {/* Bjælkerne stopper ved murens flader (og går 2 mm ind i hinanden i hjørnet), så ingen flader falder sammen. */}
      <mesh material={mats.zinc} position={[((x0 + t / 2 - 0.002) + (x1 - t / 2 - 0.002)) / 2, H - beamH / 2, z1]} castShadow>
        <boxGeometry args={[(x1 - t / 2 - 0.002) - (x0 + t / 2 - 0.002), beamH, t]} />
      </mesh>
      <mesh material={mats.zinc} position={[x0, H - beamH / 2, ((z0 + t / 2 + 0.002) + (z1 + t / 2)) / 2]} castShadow>
        <boxGeometry args={[t, beamH, (z1 + t / 2) - (z0 + t / 2 + 0.002)]} />
      </mesh>
      <mesh geometry={useMemo(() => meterBox(0.38, H - beamH, 0.38), [H])} material={mats.brick}
        position={[cx, (H - beamH) / 2, cz]} castShadow receiveShadow />
      {/* Terrassevarmer under loftet som på fotoet */}
      <mesh material={mats.zinc} position={[x0 + 1.6, H - 0.55, z0 + 0.25]}>
        <boxGeometry args={[0.7, 0.12, 0.25]} />
      </mesh>
    </group>
  )
}

export function Roofs({ house, visible }: { house: House; visible: boolean }) {
  const mats = getMaterials()
  // Skjult tag afmonteres helt — usynlige meshes rammes ellers stadig af musens raycast og blokerer klik.
  if (!visible) return null
  return (
    <group>
      <group>
        <CoveredTerrace house={house} />
        {house.roofs.map((def) => <RoofWing key={def.id} house={house} def={def} />)}
        <Gables house={house} />
        <Skylights house={house} />
        {house.chimneys.map((c, i) => {
          const top = Math.max(...house.roofs.map((d) => roofTopAt(house, d, c.at[0], c.at[1]) ?? 0))
          return (
            <mesh key={i} material={mats.zinc} position={[c.at[0], top + c.height / 2 - 0.3, c.at[1]]} castShadow>
              <cylinderGeometry args={[c.radius, c.radius, c.height + 0.3, 16]} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}
