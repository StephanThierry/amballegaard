import { RoundedBox, useGLTF } from '@react-three/drei'
import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { createGame } from './games'
import { getMaterials } from './materials'
import { meterBox } from './util'
import furnitureData from '../../../data/furniture.json'

type V3 = [number, number, number]

const fm = (() => {
  let cache: ReturnType<typeof create> | null = null
  function create() {
    const s = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
    return {
      white: s({ color: '#f3f2ee', roughness: 0.32 }),
      whiteMatte: s({ color: '#efede8', roughness: 0.7 }),
      stone: s({ color: '#e7e4de', roughness: 0.25 }),
      darkTop: s({ color: '#2f2f31', roughness: 0.3 }),
      blackGlass: s({ color: '#0d0d0f', roughness: 0.08, metalness: 0.2 }),
      steel: s({ color: '#c6c8ca', roughness: 0.25, metalness: 0.9 }),
      blackSteel: s({ color: '#1d1e20', roughness: 0.45, metalness: 0.6 }),
      porcelain: s({ color: '#fbfbfa', roughness: 0.12 }),
      oak: s({ color: '#c9a67a', roughness: 0.55 }),
      darkWood: s({ color: '#2a2726', roughness: 0.6 }),
      fabricGrey: s({ color: '#7b7f86', roughness: 1 }),
      fabricBlue: s({ color: '#2f3d55', roughness: 1 }),
      linen: s({ color: '#f1efea', roughness: 0.95 }),
      duvetBlue: s({ color: '#3d6fb0', roughness: 0.95 }),
      duvetPink: s({ color: '#e7a7b4', roughness: 0.95 }),
      duvetSand: s({ color: '#d8cdb9', roughness: 0.95 }),
      rugBeige: s({ color: '#cfc5b4', roughness: 1 }),
      rugBlue: s({ color: '#6f8fb8', roughness: 1 }),
      rugPink: s({ color: '#e9c4c9', roughness: 1 }),
      mirror: s({ color: '#dfe6ea', roughness: 0.02, metalness: 1 }),
      fire: s({ color: '#ff8a3c', emissive: '#ff6a1a', emissiveIntensity: 3, roughness: 1 }),
      screen: s({ color: '#0a0b0d', roughness: 0.15, emissive: '#1a2a3a', emissiveIntensity: 0.15 }),
      clothes: ['#3b4a63', '#c7b299', '#7a2f2f', '#e7e3db', '#4f5d4a', '#2b2b2e'].map((c) => s({ color: c, roughness: 1 })),
      dogBed: s({ color: '#8b7d6b', roughness: 1 }),
      ball: s({ color: '#f2f2f2', roughness: 0.6 }),
      kettle: s({ color: '#141416', roughness: 0.35, metalness: 0.3 }),
    }
  }
  return () => (cache ??= create())
})()

function Box({ p, s, m, rot = 0, shadow = true }: { p: V3; s: V3; m: THREE.Material; rot?: number; shadow?: boolean }) {
  const g = useMemo(() => meterBox(s[0], s[1], s[2]), [s[0], s[1], s[2]])
  return <mesh geometry={g} material={m} position={p} rotation={[0, rot, 0]} castShadow={shadow} receiveShadow />
}

/** glTF fra Poly Haven, normaliseret: bunden i y=0, centreret i xz, valgfri tilpasning til højde/bredde. */
function Model({ name, p, rot = 0, height, width }: { name: string; p: V3; rot?: number; height?: number; width?: number }) {
  const { scene } = useGLTF(`/assets/models/${name}/${name}.gltf`)
  const obj = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const k = height ? height / size.y : width ? width / Math.max(size.x, size.z) : 1
    const wrap = new THREE.Group()
    root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
    wrap.add(root)
    wrap.scale.setScalar(k)
    return wrap
  }, [scene, height, width])
  return <primitive object={obj} position={p} rotation={[0, rot, 0]} />
}

/** Vægmonterede ting (overskabe, spejle) svæver når væggene er sænket — vis dem kun med fulde vægge. */
function WallMounted({ children }: { children: ReactNode }) {
  const full = useStore((s) => s.wallMode === 'full')
  return full ? <>{children}</> : null
}

/** Placering i et lokalt koordinatsystem (fx et møbel bygget af flere kasser). */
function At({ p, rot = 0, children }: { p: V3; rot?: number; children: ReactNode }) {
  return <group position={p} rotation={[0, rot, 0]}>{children}</group>
}

/**
 * Seng. Med `duvetW` ligger der kun en enkeltdyne i den ene side (+x), og med `plush` fyldes resten af
 * madrassen med bamser og tøjdyr. Lokalt: hovedgærde ved -z, fodende ved +z.
 */
function Bed({ p, rot = 0, w, l = 2.05, duvet, duvetW, plush = 0 }: {
  p: V3; rot?: number; w: number; l?: number; duvet: THREE.Material; duvetW?: number; plush?: number
}) {
  const f = fm()
  const dw = Math.min(duvetW ?? w + 0.02, w + 0.02)
  const dx = duvetW ? w / 2 - dw / 2 + 0.01 : 0
  const pillows = duvetW ? [dx] : w > 1.2 ? [-w / 4, w / 4] : [0]
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 0.2, 0]} s={[w, 0.32, l]} m={f.fabricGrey} />
      <Box p={[0, 0.44, 0.02]} s={[w - 0.04, 0.18, l - 0.08]} m={f.linen} />
      <Box p={[dx, 0.56, 0.32]} s={[dw, 0.08, l - 0.66]} m={duvet} />
      <Box p={[0, 0.65, -l / 2 + 0.05]} s={[w + 0.04, 0.95, 0.08]} m={f.fabricGrey} />
      {pillows.map((x) => (
        <mesh key={x} material={f.linen} position={[x, 0.6, -l / 2 + 0.3]} scale={[pillows.length > 1 ? 0.32 : Math.min(0.35, dw / 2 - 0.04), 0.07, 0.2]} castShadow>
          <sphereGeometry args={[1, 16, 10]} />
        </mesh>
      ))}
      {plush > 0 && (
        <PlushPile count={plush} x0={-w / 2 + 0.05} x1={w / 2 - dw - 0.01} z0={-l / 2 + 0.14} z1={l / 2 - 0.08} y={0.53}
          extra={[[dx - 0.12, -l / 2 + 0.33], [dx + 0.14, -l / 2 + 0.36], [dx + 0.05, l / 2 - 0.22]]} />
      )}
    </At>
  )
}

const plushColors = ['#b07a4a', '#d9b48a', '#f2e6d8', '#f5b3c8', '#9fd3f0', '#c7a6f0', '#ffd75e', '#a4dba0', '#8a5a3c', '#ffffff', '#ff8fa3', '#7ec8c8']
const plushMats = new Map<string, THREE.MeshStandardMaterial>()
const plushMat = (c: string) => {
  let m = plushMats.get(c)
  if (!m) plushMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 1 })))
  return m
}

/** Bunke af tøjdyr spredt (deterministisk) i et rektangel, plus et par enkelte på faste pladser. */
function PlushPile({ count, x0, x1, z0, z1, y, extra = [] }: {
  count: number; x0: number; x1: number; z0: number; z1: number; y: number; extra?: [number, number][]
}) {
  const items = useMemo(() => {
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const out: { x: number; z: number; y: number; s: number; kind: number; c: string; c2: string; rot: number; tilt: number }[] = []
    const cols = Math.max(1, Math.round((x1 - x0) / 0.17)), rows = Math.ceil(count / cols)
    for (let i = 0; i < count; i++) {
      const cI = i % cols, r = Math.floor(i / cols)
      const s = 0.85 + rnd() * 0.7
      out.push({
        x: x0 + ((cI + 0.5) / cols) * (x1 - x0) + (rnd() - 0.5) * 0.06,
        z: z0 + ((r + 0.5) / rows) * (z1 - z0) + (rnd() - 0.5) * 0.08,
        y: y + (rnd() < 0.25 ? 0.07 : 0), // nogle ligger oven på de andre
        s, kind: Math.floor(rnd() * 5), c: plushColors[Math.floor(rnd() * plushColors.length)],
        c2: plushColors[Math.floor(rnd() * plushColors.length)], rot: (rnd() - 0.5) * 2.4, tilt: (rnd() - 0.5) * 0.5,
      })
    }
    extra.forEach(([x, z], i) => out.push({ x, z, y: y + 0.03, s: 1.1, kind: i % 3, c: plushColors[(i * 5 + 2) % plushColors.length], c2: '#ffffff', rot: Math.PI + (i - 1) * 0.4, tilt: 0 }))
    return out
  }, [count, x0, x1, z0, z1, y])
  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, it.y, it.z]} rotation={[it.tilt, it.rot, 0]} scale={it.s}>
          <Plush kind={it.kind} color={it.c} accent={it.c2} />
        </group>
      ))}
    </group>
  )
}

/** Ét tøjdyr (~15 cm). Siddende, ansigt mod +z. kind: 0 bjørn, 1 kanin, 2 kat, 3 dino, 4 kuglevæsen. */
function Plush({ kind, color, accent }: { kind: number; color: string; accent: string }) {
  const m = plushMat(color), a = plushMat(accent), eye = plushMat('#141414'), snout = plushMat('#f3e3cf')
  const S = (pos: V3, r: number, mat: THREE.Material, sc: V3 = [1, 1, 1]) => (
    <mesh position={pos} material={mat} scale={sc} castShadow><sphereGeometry args={[r, 12, 10]} /></mesh>
  )
  const eyes = (y: number, z: number, dx = 0.018) => <>{S([-dx, y, z], 0.007, eye)}{S([dx, y, z], 0.007, eye)}</>
  switch (kind) {
    case 0: // bjørn
      return <group>{S([0, 0.045, 0], 0.05, m, [1, 1.05, 0.9])}{S([0, 0.115, 0.005], 0.04, m)}
        {S([-0.03, 0.15, 0], 0.014, m)}{S([0.03, 0.15, 0], 0.014, m)}{S([0, 0.105, 0.035], 0.015, snout)}
        {eyes(0.125, 0.034)}{S([-0.04, 0.015, 0.03], 0.018, m)}{S([0.04, 0.015, 0.03], 0.018, m)}
        {S([0, 0.05, 0.04], 0.022, a, [1, 1, 0.4])}</group>
    case 1: // kanin
      return <group>{S([0, 0.04, 0], 0.045, m)}{S([0, 0.1, 0.005], 0.035, m)}
        {S([-0.015, 0.165, -0.005], 0.012, m, [1, 3, 0.7])}{S([0.015, 0.165, -0.005], 0.012, m, [1, 3, 0.7])}
        {S([0, 0.092, 0.032], 0.008, plushMat('#ff9db5'))}{eyes(0.108, 0.03, 0.014)}{S([0, 0.03, -0.045], 0.016, a)}</group>
    case 2: // kat
      return <group>{S([0, 0.04, 0], 0.045, m, [1, 1.1, 0.9])}{S([0, 0.105, 0], 0.038, m, [1.1, 1, 1])}
        <mesh position={[-0.024, 0.14, 0]} material={m} castShadow><coneGeometry args={[0.012, 0.025, 6]} /></mesh>
        <mesh position={[0.024, 0.14, 0]} material={m} castShadow><coneGeometry args={[0.012, 0.025, 6]} /></mesh>
        {eyes(0.11, 0.034, 0.015)}{S([0.03, 0.025, -0.05], 0.01, m, [1, 1, 3])}</group>
    case 3: // dino
      return <group>{S([0, 0.04, 0], 0.045, m, [0.9, 1, 1.2])}{S([0, 0.09, 0.05], 0.03, m, [1, 1, 1.3])}
        {S([0, 0.03, -0.07], 0.02, m, [1, 1, 2])}{eyes(0.1, 0.085, 0.013)}
        {[-0.02, 0.01, 0.04].map((z) => <mesh key={z} position={[0, 0.088, z]} material={a}><coneGeometry args={[0.01, 0.022, 4]} /></mesh>)}</group>
    default: // kuglevæsen
      return <group>{S([0, 0.05, 0], 0.055, m)}{eyes(0.065, 0.048, 0.02)}{S([0, 0.045, 0.052], 0.01, a, [1.6, 0.6, 0.5])}</group>
  }
}

function Wardrobe({ p, rot = 0, w, h = 2.2, d = 0.6 }: { p: V3; rot?: number; w: number; h?: number; d?: number }) {
  const f = fm()
  const doors = Math.max(1, Math.round(w / 0.5))
  return (
    <At p={p} rot={rot}>
      <Box p={[0, h / 2, -0.011]} s={[w, h, d - 0.022]} m={f.whiteMatte} />
      <CabinetDoors w={w} h={h} y0={0} z={d / 2 - 0.011} count={doors} m={f.whiteMatte} />
    </At>
  )
}

/**
 * Skabslåger som selvstændige paneler med afrundede kanter og en lille fuge imellem. Skillelinjerne opstår af
 * lys/skygge på kanterne i stedet for en tynd streg, som var under én pixel bred og flimrede ved panorering.
 */
function CabinetDoors({ w, h, y0, z, count, m }: { w: number; h: number; y0: number; z: number; count: number; m: THREE.Material }) {
  const gap = 0.006
  const dw = (w - gap * (count + 1)) / count
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <RoundedBox key={i} args={[dw, h - 2 * gap, 0.022]} radius={0.005} smoothness={2}
          position={[-w / 2 + gap + dw / 2 + i * (dw + gap), y0 + h / 2, z]} material={m} castShadow receiveShadow />
      ))}
    </>
  )
}

/** Et spil vist som selvlysende plan (fx på en indbygget skærm). Planet vender mod +z. */
function GameScreen({ kind, w, h, position }: { kind: string; w: number; h: number; position: V3 }) {
  const game = useMemo(() => createGame(kind, 1), [kind])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: game.texture, toneMapped: false }), [game])
  useFrame(({ clock }) => game.update(clock.elapsedTime))
  return <mesh material={mat} position={position}><planeGeometry args={[w, h]} /></mesh>
}

function Desk({ p, rot = 0, w = 1.2, game }: { p: V3; rot?: number; w?: number; game?: string }) {
  const f = fm()
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 0.73, 0]} s={[w, 0.03, 0.6]} m={f.oak} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x * (w / 2 - 0.04), 0.36, z * 0.26]} s={[0.03, 0.72, 0.03]} m={f.blackSteel} />
      ))}
      <Box p={[0.2, 0.95, -0.15]} s={[0.5, 0.32, 0.02]} m={f.screen} />
      {game && <GameScreen kind={game} w={0.48} h={0.3} position={[0.2, 0.95, -0.1395]} />}
      <Box p={[0.2, 0.78, -0.15]} s={[0.04, 0.12, 0.04]} m={f.blackSteel} />
      <OfficeChair p={[0, 0, 0.55]} rot={Math.PI} />
    </At>
  )
}

function OfficeChair({ p, rot = 0 }: { p: V3; rot?: number }) {
  const f = fm()
  return (
    <At p={p} rot={rot}>
      <mesh material={f.blackSteel} position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.025, 0.025, 0.4, 8]} /></mesh>
      <mesh material={f.blackSteel} position={[0, 0.04, 0]}><cylinderGeometry args={[0.3, 0.3, 0.03, 5]} /></mesh>
      <Box p={[0, 0.47, 0]} s={[0.46, 0.07, 0.44]} m={f.fabricBlue} />
      <Box p={[0, 0.78, -0.21]} s={[0.44, 0.52, 0.06]} m={f.fabricBlue} />
    </At>
  )
}

function Stool({ p }: { p: V3 }) {
  const f = fm()
  return (
    <At p={p}>
      <mesh material={f.oak} position={[0, 0.66, 0]} castShadow><cylinderGeometry args={[0.18, 0.18, 0.04, 20]} /></mesh>
      <mesh material={f.blackSteel} position={[0, 0.33, 0]} castShadow><cylinderGeometry args={[0.02, 0.02, 0.64, 8]} /></mesh>
      <mesh material={f.blackSteel} position={[0, 0.01, 0]}><cylinderGeometry args={[0.2, 0.2, 0.02, 20]} /></mesh>
    </At>
  )
}

function Toilet({ p, rot = 0 }: { p: V3; rot?: number }) {
  const f = fm()
  // Væghængt toilet; væg ved -z
  return (
    <At p={p} rot={rot}>
      <mesh material={f.porcelain} position={[0, 0.38, 0.05]} scale={[0.19, 0.12, 0.28]} castShadow><sphereGeometry args={[1, 20, 12]} /></mesh>
      <Box p={[0, 0.3, -0.15]} s={[0.36, 0.2, 0.12]} m={f.porcelain} />
      <Box p={[0, 1.0, -0.2]} s={[0.22, 0.14, 0.02]} m={f.white} />
    </At>
  )
}

function Vanity({ p, rot = 0, w = 1.2 }: { p: V3; rot?: number; w?: number }) {
  const f = fm()
  // Væg ved -z
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 0.65, 0]} s={[w, 0.3, 0.48]} m={f.oak} />
      <Box p={[0, 0.81, 0]} s={[w + 0.02, 0.025, 0.5]} m={f.porcelain} />
      <mesh material={f.porcelain} position={[0, 0.84, 0.02]} scale={[0.22, 0.04, 0.16]}><sphereGeometry args={[1, 20, 10]} /></mesh>
      <mesh material={f.steel} position={[0, 0.92, -0.18]}><cylinderGeometry args={[0.015, 0.015, 0.18, 8]} /></mesh>
      <WallMounted><Box p={[0, 1.5, -0.235]} s={[w * 0.9, 0.8, 0.01]} m={f.mirror} shadow={false} /></WallMounted>
    </At>
  )
}

function Bathtub({ p, rot = 0 }: { p: V3; rot?: number }) {
  const f = fm()
  const m = getMaterials()
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 0.28, 0]} s={[1.75, 0.56, 0.75]} m={f.porcelain} />
      <mesh material={m.glass} position={[0, 0.57, 0]}><boxGeometry args={[1.6, 0.01, 0.6]} /></mesh>
    </At>
  )
}

function Shower({ p, rot = 0 }: { p: V3; rot?: number }) {
  const f = fm()
  const m = getMaterials()
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 0.02, 0]} s={[0.9, 0.04, 0.9]} m={f.porcelain} />
      <mesh material={m.glass} position={[-0.45, 1.0, 0]}><boxGeometry args={[0.01, 2.0, 0.9]} /></mesh>
      <mesh material={f.steel} position={[0.35, 2.0, -0.2]}><cylinderGeometry args={[0.12, 0.12, 0.01, 20]} /></mesh>
    </At>
  )
}

function WoodStove({ p }: { p: V3 }) {
  const f = fm()
  return (
    <At p={p}>
      <Box p={[0, 0.01, 0.25]} s={[1.0, 0.02, 0.9]} m={f.darkTop} />
      <Box p={[0, 0.55, 0]} s={[0.5, 1.1, 0.42]} m={f.kettle} />
      <Box p={[0, 0.6, 0.212]} s={[0.36, 0.34, 0.005]} m={f.blackGlass} shadow={false} />
      <Box p={[0, 0.5, 0.2]} s={[0.26, 0.12, 0.02]} m={f.fire} shadow={false} />
      <mesh material={f.kettle} position={[0, 1.85, 0]} castShadow><cylinderGeometry args={[0.075, 0.075, 1.5, 16]} /></mesh>
      <pointLight position={[0, 0.55, 0.45]} color="#ff8a3c" intensity={1.6} distance={3.5} decay={2} />
    </At>
  )
}

function Tv({ p, rot = 0, width = 1.45, game }: { p: V3; rot?: number; width?: number; game?: string }) {
  const f = fm()
  const h = width * 0.5625 + 0.02
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 0, 0]} s={[width, h, 0.035]} m={f.screen} />
      {game && <GameScreen kind={game} w={width - 0.03} h={h - 0.03} position={[0, 0, 0.0185]} />}
    </At>
  )
}

function Grill({ p }: { p: V3 }) {
  const f = fm()
  return (
    <At p={p}>
      <mesh material={f.kettle} position={[0, 0.85, 0]} scale={[1, 0.85, 1]} castShadow><sphereGeometry args={[0.3, 24, 16]} /></mesh>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} material={f.blackSteel} position={[Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 0.65, 6]} />
        </mesh>
      ))}
    </At>
  )
}

function WalkInShelves({ p, rot = 0, w }: { p: V3; rot?: number; w: number }) {
  const f = fm()
  const cols = Math.round(w / 0.6)
  return (
    <At p={p} rot={rot}>
      <Box p={[0, 1.1, -0.2]} s={[w, 2.2, 0.02]} m={f.darkWood} />
      {[0.02, 0.5, 1.0, 1.4, 1.8, 2.19].map((y) => <Box key={y} p={[0, y, 0]} s={[w, 0.025, 0.42]} m={f.darkWood} />)}
      {Array.from({ length: cols + 1 }, (_, i) => <Box key={i} p={[-w / 2 + (i * w) / cols, 1.1, 0]} s={[0.025, 2.2, 0.42]} m={f.darkWood} />)}
      {Array.from({ length: cols * 3 }, (_, i) => (
        <Box key={`c${i}`} p={[-w / 2 + 0.12 + (i * (w - 0.24)) / (cols * 3 - 1), 1.5, 0.02]} s={[0.06, 0.55, 0.36]} m={f.clothes[i % f.clothes.length]} />
      ))}
    </At>
  )
}

function KitchenRun({ length }: { length: number }) {
  const f = fm()
  // Lokalt: ryg mod væggen ved -z, front mod +z.
  return (
    <group>
      <Box p={[0, 0.44, 0]} s={[length, 0.88, 0.6]} m={f.white} />
      <Box p={[0, 0.9, 0]} s={[length + 0.02, 0.035, 0.63]} m={f.darkTop} />
      <Box p={[0.04, 0.92, 0.02]} s={[0.6, 0.006, 0.52]} m={f.blackGlass} shadow={false} />
      <WallMounted><Box p={[0, 1.75, -0.11]} s={[length, 0.7, 0.36]} m={f.white} /></WallMounted>
    </group>
  )
}

function Counter({ length }: { length: number }) {
  const f = fm()
  return (
    <group>
      <Box p={[0, 0.44, 0]} s={[length, 0.88, 0.6]} m={f.white} />
      <Box p={[0, 0.9, 0]} s={[length + 0.02, 0.035, 0.62]} m={f.darkTop} />
      <Box p={[-length / 4, 0.905, 0]} s={[0.45, 0.01, 0.38]} m={f.steel} shadow={false} />
    </group>
  )
}

function TallCabinets({ w }: { w: number }) {
  const f = fm()
  return (
    <group>
      <Box p={[0, 1.1, -0.011]} s={[w, 2.2, 0.478]} m={f.white} />
      <CabinetDoors w={w} h={2.2} y0={0} z={0.239} count={4} m={f.white} />
    </group>
  )
}

function KitchenIsland() {
  const f = fm()
  return (
    <group>
      <Box p={[0, 0.44, 0]} s={[1.0, 0.88, 2.2]} m={f.white} />
      <Box p={[0.08, 0.9, 0]} s={[1.25, 0.04, 2.3]} m={f.stone} />
      <Box p={[-0.25, 0.905, -0.4]} s={[0.4, 0.01, 0.5]} m={f.steel} shadow={false} />
      <mesh material={f.steel} position={[-0.4, 1.08, -0.4]} castShadow><cylinderGeometry args={[0.015, 0.015, 0.34, 8]} /></mesh>
    </group>
  )
}

function DiningTable({ w, d }: { w: number; d: number }) {
  const f = fm()
  return (
    <group>
      <Box p={[0, 0.74, 0]} s={[w, 0.04, d]} m={f.oak} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x * (w / 2 - 0.1), 0.36, z * (d / 2 - 0.1)]} s={[0.05, 0.72, 0.05]} m={f.blackSteel} />
      ))}
    </group>
  )
}

/**
 * Vaskemaskine og tørretumbler ved siden af hinanden, hver på en sokkel med to skuffer.
 * Lokalt: front mod +z; vaskemaskinen til venstre (-x), tørretumbleren til højre.
 */
function WasherDryer() {
  const f = fm()
  const W = 0.6, D = 0.6, base = 0.36, H = 0.85
  return (
    <group>
      {[-1, 1].map((side) => {
        const x = side * (W / 2 + 0.005)
        const dryer = side === 1
        return (
          <group key={side} position={[x, 0, 0]}>
            {/* Sokkel med to skuffer */}
            <Box p={[0, base / 2, -0.01]} s={[W, base, D - 0.02]} m={f.white} />
            {[0, 1].map((k) => (
              <group key={k}>
                <Box p={[0, 0.02 + k * (base / 2) + base / 4 - 0.01, D / 2 - 0.005]} s={[W - 0.02, base / 2 - 0.02, 0.02]} m={f.white} />
                <Box p={[0, 0.02 + k * (base / 2) + base / 4 + 0.03, D / 2 + 0.01]} s={[0.18, 0.012, 0.012]} m={f.steel} shadow={false} />
              </group>
            ))}
            {/* Apparatet */}
            <Box p={[0, base + H / 2, 0]} s={[W, H, D]} m={f.porcelain} />
            <Box p={[0, base + H - 0.06, D / 2 + 0.002]} s={[W - 0.02, 0.1, 0.004]} m={f.white} shadow={false} />
            <mesh material={f.blackGlass} position={[-0.17, base + H - 0.06, D / 2 + 0.008]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.012, 20]} /></mesh>
            <Box p={[0.08, base + H - 0.06, D / 2 + 0.005]} s={[0.16, 0.04, 0.004]} m={f.screen} shadow={false} />
            <mesh material={f.steel} position={[0, base + H * 0.42, D / 2 + 0.006]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.19, 0.19, 0.012, 32]} /></mesh>
            <mesh material={dryer ? f.screen : f.blackGlass} position={[0, base + H * 0.42, D / 2 + 0.013]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.155, 0.155, 0.006, 32]} /></mesh>
          </group>
        )
      })}
    </group>
  )
}

/**
 * Skærme på række. `layout` grupperer dem pr. PC (fx [2, 1] = to samlet, mellemrum, én), og `games` angiver
 * hvilket spil hver PC kører — spillet tegnes som én tekstur strakt over gruppens skærme.
 * Lokalt: skærmene vender mod +z, står i en lige linje langs x, fødderne i y=0.
 */
function Monitors({ count, size = 0.62, layout, games }: { count: number; size?: number; layout?: number[]; games?: string[] }) {
  const f = fm()
  const groups = layout ?? [count]
  const h = size * 0.58
  const inner = 0.012, groupGap = 0.25
  const total = groups.reduce((s, n) => s + n * size + (n - 1) * inner, 0) + (groups.length - 1) * groupGap
  const live = useMemo(() => groups.map((n, gi) => (games?.[gi] ? createGame(games[gi], n) : null)), [groups.join(','), games?.join(',')])
  const planes = useMemo(() => groups.map((n) => Array.from({ length: n }, (_, i) => {
    const g = new THREE.PlaneGeometry(size - 0.02, h - 0.02)
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / n)
    return g
  })), [groups.join(','), size, h])
  const screenMats = useMemo(() => live.map((g) => (g ? new THREE.MeshBasicMaterial({ map: g.texture, toneMapped: false }) : null)), [live])
  useFrame(({ clock }) => live.forEach((g) => g?.update(clock.elapsedTime)))

  let x = -total / 2
  return (
    <group>
      {groups.map((n, gi) => {
        const items = Array.from({ length: n }, (_, i) => {
          const cx = x + size / 2 + i * (size + inner)
          return (
            <group key={i} position={[cx, 0, 0]}>
              <Box p={[0, 0.12 + h / 2, 0]} s={[size, h, 0.025]} m={f.screen} />
              {screenMats[gi] && <mesh geometry={planes[gi][i]} material={screenMats[gi]!} position={[0, 0.12 + h / 2, 0.0135]} />}
              <Box p={[0, 0.07, -0.04]} s={[0.04, 0.14, 0.04]} m={f.blackSteel} />
              <Box p={[0, 0.006, -0.03]} s={[0.22, 0.012, 0.16]} m={f.blackSteel} />
            </group>
          )
        })
        x += n * size + (n - 1) * inner + groupGap
        return <group key={gi}>{items}</group>
      })}
    </group>
  )
}


/** Sort skrivebord: plade på fire ben. Lokalt: længde langs x, dybde langs z. */
function WorkDesk({ l, d, color = '#1a1a1c' }: { l: number; d: number; color?: string }) {
  const f = fm()
  const top = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.45 }), [color])
  const H = 0.75, T = 0.03
  return (
    <group>
      <Box p={[0, H - T / 2, 0]} s={[l, T, d]} m={top} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x * (l / 2 - 0.05), (H - T) / 2, z * (d / 2 - 0.05)]} s={[0.05, H - T, 0.05]} m={f.blackSteel} />
      ))}
      {/* Tværbjælke bagtil */}
      <Box p={[0, H - 0.12, -d / 2 + 0.05]} s={[l - 0.1, 0.06, 0.03]} m={f.blackSteel} />
    </group>
  )
}

/**
 * Gaming-tastatur med taster og svag RGB-kant, plus mus på musemåtte til højre for brugeren.
 * Lokalt: brugeren sidder ved +z og kigger mod -z; længden langs x; står oven på en flade i y=0.
 */
function KeyboardMouse({ glow = '#7a5cff' }: { glow?: string }) {
  const f = fm()
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.5, metalness: 0.2 }),
    key: new THREE.MeshStandardMaterial({ color: '#232327', roughness: 0.6 }),
    rgb: new THREE.MeshStandardMaterial({ color: '#000', emissive: glow, emissiveIntensity: 1.6, toneMapped: false }),
    pad: new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.95 }),
  }), [glow])
  const W = 0.44, D = 0.14
  const keyGeo = useMemo(() => new THREE.BoxGeometry(0.016, 0.008, 0.016), [])
  const keysRef = useRef<THREE.InstancedMesh>(null)
  const rows = 5, cols = 21
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    let i = 0
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      m.makeTranslation(-W / 2 + 0.018 + c * 0.0193, 0.021, -D / 2 + 0.02 + r * 0.0225)
      keysRef.current!.setMatrixAt(i++, m)
    }
    keysRef.current!.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      <Box p={[0, 0.009, 0]} s={[W, 0.018, D]} m={mats.body} />
      <Box p={[0, 0.0015, D / 2 - 0.002]} s={[W - 0.01, 0.003, 0.004]} m={mats.rgb} shadow={false} />
      <instancedMesh ref={keysRef} args={[keyGeo, mats.key, rows * cols]} castShadow />
      {/* Musemåtte + mus til højre */}
      <Box p={[W / 2 + 0.17, 0.0015, 0.01]} s={[0.28, 0.003, 0.24]} m={mats.pad} shadow={false} />
      <RoundedBox args={[0.064, 0.036, 0.115]} radius={0.016} smoothness={3} position={[W / 2 + 0.17, 0.021, 0.02]} material={f.blackGlass} castShadow />
      <Box p={[W / 2 + 0.17, 0.0035, 0.02]} s={[0.05, 0.002, 0.1]} m={mats.rgb} shadow={false} />
    </group>
  )
}

/** Stationær PC (tower) i sort med lille LED. Lokalt: front mod +z. */
function PcTower() {
  const f = fm()
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0a0a', emissive: '#5fa8ff', emissiveIntensity: 2, toneMapped: false }), [])
  return (
    <group>
      <Box p={[0, 0.24, 0]} s={[0.21, 0.46, 0.45]} m={f.blackGlass} />
      <Box p={[0.06, 0.42, 0.226]} s={[0.04, 0.008, 0.002]} m={led} shadow={false} />
    </group>
  )
}

/** Skuffedarie: sort korpus med skuffefronter i kirsebærtræ. Lokalt: front mod +z. */
function Dresser({ w = 1.0, h = 0.8, d = 0.45, drawers = 4, color = '#141414', fronts = '#8a3a22' }: {
  w?: number; h?: number; d?: number; drawers?: number; color?: string; fronts?: string
}) {
  const m = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: fronts, roughness: 0.45 }),
  }), [color, fronts])
  const plinth = 0.06, frame = 0.025
  const fh = (h - plinth - frame * (drawers + 1)) / drawers
  return (
    <group>
      <Box p={[0, plinth + (h - plinth) / 2, 0]} s={[w, h - plinth, d]} m={m.body} />
      <Box p={[0, plinth / 2, -0.02]} s={[w - 0.04, plinth, d - 0.06]} m={m.body} />
      {Array.from({ length: drawers }, (_, i) => {
        const y = plinth + frame + i * (fh + frame) + fh / 2
        return (
          <group key={i}>
            <Box p={[0, y, d / 2 + 0.006]} s={[w - 2 * frame, fh, 0.012]} m={m.wood} />
            <LudoKnob position={[0, y, d / 2 + 0.012]} />
          </group>
        )
      })}
    </group>
  )
}

/** Lille sort knop formet som en ludobrik (fod, krop og kugle), der stikker ud af skuffen langs +z. */
function LudoKnob({ position }: { position: [number, number, number] }) {
  const f = fm()
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh material={f.blackGlass} position={[0, 0.003, 0]}><cylinderGeometry args={[0.011, 0.012, 0.006, 16]} /></mesh>
      <mesh material={f.blackGlass} position={[0, 0.014, 0]}><cylinderGeometry args={[0.0045, 0.009, 0.016, 16]} /></mesh>
      <mesh material={f.blackGlass} position={[0, 0.026, 0]} castShadow><sphereGeometry args={[0.0075, 16, 12]} /></mesh>
    </group>
  )
}

/** Reol med bøger. Lokalt: front mod +z, bredde langs x. */
function Bookshelf({ w = 1.9, h = 1.9, d = 0.35, color = '#141414', shelves = 5 }: {
  w?: number; h?: number; d?: number; color?: string; shelves?: number
}) {
  const f = fm()
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), [color])
  const T = 0.025
  const bays = Math.max(1, Math.round(w / 0.8))
  const gap = (h - T) / shelves
  const books = useMemo(() => {
    const out: { x: number; y: number; bw: number; bh: number; c: number }[] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let s = 0; s < shelves; s++) {
      if (s === 2) continue // en hylde med luft til pynt
      let x = -w / 2 + T + 0.02
      while (x < w / 2 - T - 0.05) {
        const bw = 0.025 + rnd() * 0.035, bh = gap * (0.55 + rnd() * 0.3)
        if (rnd() < 0.12) { x += 0.08; continue }
        out.push({ x: x + bw / 2, y: T + s * gap + bh / 2, bw, bh, c: Math.floor(rnd() * f.clothes.length) })
        x += bw + 0.002
      }
    }
    return out
  }, [w, h, shelves, gap, f.clothes.length])
  return (
    <group>
      <Box p={[0, h / 2, -d / 2 + T / 2]} s={[w, h, T]} m={body} />
      {Array.from({ length: shelves + 1 }, (_, i) => <Box key={`h${i}`} p={[0, T / 2 + i * gap, 0]} s={[w, T, d]} m={body} />)}
      {Array.from({ length: bays + 1 }, (_, i) => <Box key={`v${i}`} p={[-w / 2 + T / 2 + (i * (w - T)) / bays, h / 2, 0]} s={[T, h, d]} m={body} />)}
      {books.map((b, i) => <Box key={`b${i}`} p={[b.x, b.y, 0.01]} s={[b.bw, b.bh, d * 0.75]} m={f.clothes[b.c]} />)}
    </group>
  )
}


const velourMats = new Map<string, THREE.MeshPhysicalMaterial>()
/** Velour: mat grundfarve + lys "sheen" i fibrenes retning giver den bløde glans på kanterne. */
function velour(hex: string) {
  let m = velourMats.get(hex)
  if (!m) {
    const sheen = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.45)
    velourMats.set(hex, (m = new THREE.MeshPhysicalMaterial({
      color: hex, roughness: 0.9, sheen: 1, sheenColor: sheen, sheenRoughness: 0.32,
    })))
  }
  return m
}

/**
 * Moderne chaiselong-sofa i stil med Hjort Knudsen "Hadsten": lav og kantet med bløde hjørner,
 * løse ryg- og siddehynder, smalt armlæn og slanke ben. Lokalt: front mod +z, chaiselong i -x
 * (venstre set forfra) med side = 'left'.
 */
function ChaiseSofa({ color, w = 2.8, side = 'left' }: { color: string; w?: number; side?: 'left' | 'right' }) {
  const f = fm()
  const m = velour(color)
  const D = 0.94, chaiseW = 0.95, chaiseD = 1.6, arm = 0.16
  const baseY = 0.12, seatY = 0.39, cushion = 0.19
  const s = side === 'left' ? 1 : -1 // spejling: chaiselong i -x for 'left'
  const x0 = -w / 2, x1 = w / 2
  const chaiseX = x0 + chaiseW / 2
  const mainSeatX0 = x0 + chaiseW, mainSeatX1 = x1 - arm
  const seats = 2
  const seatW = (mainSeatX1 - mainSeatX0) / seats
  const backZ = -D / 2 + 0.12
  const backCushions = 3
  const backW = (x1 - arm - x0) / backCushions
  const front = -D / 2 + chaiseD
  const legs: [number, number][] = [[x0 + 0.06, -D / 2 + 0.06], [x1 - 0.06, -D / 2 + 0.06], [x1 - 0.06, D / 2 - 0.06],
    [x0 + chaiseW - 0.06, D / 2 - 0.06], [x0 + 0.06, front - 0.06], [x0 + chaiseW - 0.06, front - 0.06]]

  return (
    <group scale={[s, 1, 1]}>
      {/* Underramme: hoveddel + chaiselong */}
      <RoundedBox args={[w, seatY - baseY, D]} radius={0.03} smoothness={3} position={[0, (baseY + seatY) / 2, 0]} material={m} castShadow receiveShadow />
      <RoundedBox args={[chaiseW, seatY - baseY, chaiseD - D + 0.02]} radius={0.03} smoothness={3}
        position={[chaiseX, (baseY + seatY) / 2, D / 2 + (chaiseD - D) / 2 - 0.01]} material={m} castShadow receiveShadow />
      {/* Ryg + armlæn */}
      <RoundedBox args={[w, 0.3, 0.16]} radius={0.04} smoothness={3} position={[0, seatY + 0.15, -D / 2 + 0.08]} material={m} castShadow />
      <RoundedBox args={[arm, 0.24, D]} radius={0.05} smoothness={3} position={[x1 - arm / 2, seatY + 0.12, 0]} material={m} castShadow />
      {/* Siddehynder */}
      {Array.from({ length: seats }, (_, i) => (
        <RoundedBox key={i} args={[seatW - 0.006, cushion, D - 0.18]} radius={0.075} smoothness={5}
          position={[mainSeatX0 + seatW * (i + 0.5), seatY + cushion / 2, 0.06]} material={m} castShadow receiveShadow />
      ))}
      <RoundedBox args={[chaiseW - 0.006, cushion, chaiseD - 0.18]} radius={0.075} smoothness={5}
        position={[chaiseX, seatY + cushion / 2, -D / 2 + 0.16 + (chaiseD - 0.2) / 2]} material={m} castShadow receiveShadow />
      {/* Løse ryghynder, let bagoverhældende */}
      {Array.from({ length: backCushions }, (_, i) => (
        <RoundedBox key={i} args={[backW - 0.01, 0.46, 0.26]} radius={0.1} smoothness={5}
          position={[x0 + backW * (i + 0.5), seatY + cushion + 0.2, backZ + 0.08]} rotation={[-0.16, 0, 0]} material={m} castShadow />
      ))}
      {/* Ben */}
      {legs.map(([x, z]) => (
        <mesh key={`${x}${z}`} material={f.darkWood} position={[x, baseY / 2, z]} castShadow>
          <cylinderGeometry args={[0.022, 0.014, baseY, 10]} />
        </mesh>
      ))}
    </group>
  )
}

/** Ekstruderet, afrundet profil (bevel giver polstret look). Formen ligger i lokal XY, ekstruderes langs +Z og centreres. */
function softExtrude(shape: THREE.Shape, depth: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9,
    bevelSegments: 5, curveSegments: 24,
  })
  g.translate(0, 0, -(depth - 2 * bevel) / 2)
  g.computeVertexNormals()
  return g
}

/**
 * Klassisk dansk øreklapstol i mohair-velour: buet ryg med "skuldre", svungne ører, rullede armlæn,
 * tyk siddehynde og frynser hele vejen rundt ned mod gulvet. Lokalt: front mod +z.
 */
function WingChair({ color }: { color: string }) {
  const m = velour(color)
  const fringeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).offsetHSL(0.01, -0.05, -0.04), roughness: 1,
  }), [color])
  const W = 0.9, D = 0.88, skirt = 0.2

  const geo = useMemo(() => {
    // Ryg: lige sider, skuldre og buet top (bredde 0.64, højde til 1.04).
    const back = new THREE.Shape()
    back.moveTo(-0.32, 0)
    back.lineTo(-0.32, 0.36)
    back.quadraticCurveTo(-0.33, 0.5, -0.24, 0.56)
    back.quadraticCurveTo(0, 0.66, 0.24, 0.56)
    back.quadraticCurveTo(0.33, 0.5, 0.32, 0.36)
    back.lineTo(0.32, 0)
    back.lineTo(-0.32, 0)
    return {
      back: softExtrude(back, 0.15, 0.04),
    }
  }, [])

  // Frynser: tynde tråde langs hele omkredsen af skørtet.
  const fringeRef = useRef<THREE.InstancedMesh>(null)
  const spacing = 0.009
  const perimeter: [number, number, number][] = []
  for (let x = -W / 2; x <= W / 2; x += spacing) { perimeter.push([x, D / 2 + 0.006, 0]); perimeter.push([x, -D / 2 - 0.006, 0]) }
  for (let z = -D / 2; z <= D / 2; z += spacing) { perimeter.push([W / 2 + 0.006, z, 1]); perimeter.push([-W / 2 - 0.006, z, 1]) }
  useLayoutEffect(() => {
    const mat = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    perimeter.forEach(([a, b, side], i) => {
      const jitter = Math.sin(i * 12.9898) * 0.5 + 0.5
      const len = skirt - 0.03 + jitter * 0.015
      q.setFromEuler(new THREE.Euler((jitter - 0.5) * 0.12, 0, (jitter - 0.5) * 0.12))
      const pos = side ? new THREE.Vector3(a, 0.012 + skirt - 0.03 - len / 2 + 0.01, b) : new THREE.Vector3(a, 0.012 + skirt - 0.03 - len / 2 + 0.01, b)
      mat.compose(pos, q, new THREE.Vector3(1, len / 0.17, 1))
      fringeRef.current!.setMatrixAt(i, mat)
    })
    fringeRef.current!.instanceMatrix.needsUpdate = true
  }, [perimeter.length])

  const armY = 0.2
  return (
    <group>
      {/* Underkrop/skørt og bånd over frynserne */}
      <RoundedBox args={[W - 0.02, 0.32, D - 0.02]} radius={0.03} smoothness={3} position={[0, skirt + 0.06, 0]} material={m} castShadow receiveShadow />
      <mesh material={fringeMat} position={[0, skirt - 0.012, 0]} castShadow>
        <boxGeometry args={[W + 0.016, 0.022, D + 0.016]} />
      </mesh>
      <instancedMesh ref={fringeRef} args={[undefined, fringeMat, perimeter.length]} castShadow>
        <boxGeometry args={[0.005, 0.17, 0.005]} />
      </instancedMesh>
      {/* Tyk siddehynde der buler lidt frem */}
      <RoundedBox args={[0.62, 0.15, 0.7]} radius={0.065} smoothness={5} position={[0, 0.5, 0.06]} material={m} castShadow receiveShadow />
      {/* Ryg, let bagoverhældende */}
      <mesh geometry={geo.back} material={m} position={[0, 0.42, -D / 2 + 0.1]} rotation={[-0.12, 0, 0]} castShadow receiveShadow />
      {/* Almindelige polstrede armlæn med rullet top */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (W / 2 - 0.065), armY, 0.02]}>
          <RoundedBox args={[0.13, 0.4, 0.78]} radius={0.04} smoothness={4} position={[0, 0.2, 0]} material={m} castShadow receiveShadow />
          <mesh material={m} position={[s * 0.01, 0.41, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <capsuleGeometry args={[0.075, 0.66, 8, 20]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * Dråbeformet sofabord: hvid plade (bred i den ene ende, smal i den anden) på tre skrå,
 * tilspidsede ben i lyst træ. Lokalt: længdeaksen langs x, den brede ende i -x.
 */
function DropTable({ l = 0.9, d = 0.55, h = 0.45 }: { l?: number; d?: number; h?: number }) {
  const m = useMemo(() => ({
    top: new THREE.MeshStandardMaterial({ color: '#f6f6f3', roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ color: '#d8b98e', roughness: 0.6 }),
  }), [])
  const T = 0.024
  const geo = useMemo(() => {
    // Asymmetrisk oval: bred bue i -x, smallere i +x, lidt fladere langs den ene langside.
    const pts = [
      [-0.5, 0.0], [-0.44, 0.4], [-0.18, 0.5], [0.15, 0.42], [0.42, 0.22], [0.5, 0.0],
      [0.42, -0.18], [0.15, -0.3], [-0.18, -0.4], [-0.44, -0.36],
    ].map(([x, y]) => new THREE.Vector2(x * l, y * d))
    const curve = new THREE.SplineCurve([...pts, pts[0]])
    const shape = new THREE.Shape(curve.getPoints(80))
    const g = new THREE.ExtrudeGeometry(shape, { depth: T - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 80 })
    g.rotateX(-Math.PI / 2) // formens y → -z, ekstrudering → +y
    return g
  }, [l, d])
  // Tre ben placeret ind under pladen, spredt let udad.
  const legs: [number, number][] = [[-0.3 * l, 0.22 * d], [-0.26 * l, -0.2 * d], [0.3 * l, 0.02 * d]]
  const legLen = h - T
  const splay = 0.14
  return (
    <group>
      <mesh geometry={geo} material={m.top} position={[0, h - T + 0.004, 0]} castShadow receiveShadow />
      {legs.map(([x, z], i) => {
        // Benets fod skal pege udad fra midten: R_x flytter foden mod -z, R_z flytter den mod +x.
        const len = Math.hypot(x, z) || 1
        return (
        <group key={i} position={[x, h - T, z]} rotation={[(-z / len) * splay, 0, (x / len) * splay]}>
          <mesh material={m.wood} position={[0, -legLen / 2, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.014, legLen, 12]} />
          </mesh>
        </group>
        )
      })}
    </group>
  )
}

/** Massiv betonblok (fx som tv-bord). Lokalt: centreret i xz, bund i y=0. */
function ConcreteBlock({ w = 0.45, h = 0.42, d = 0.45, legs = 0, contents }: {
  w?: number; h?: number; d?: number; legs?: number; contents?: string
}) {
  const m = getMaterials()
  const f = fm()
  const t = 0.05 // godstykkelse omkring det firkantede hul (hullet går fra front til bagside)
  const parts = useMemo(() => [
    { g: meterBox(w, t, d), y: t / 2, x: 0 },
    { g: meterBox(w, t, d), y: h - t / 2, x: 0 },
    { g: meterBox(t, h - 2 * t, d), y: h / 2, x: -w / 2 + t / 2 },
    { g: meterBox(t, h - 2 * t, d), y: h / 2, x: w / 2 - t / 2 },
  ], [w, h, d])
  const legGeo = useMemo(() => new THREE.CylinderGeometry(0.018, 0.013, legs, 12), [legs])
  const inner = { w: w - 2 * t, h: h - 2 * t, d }
  return (
    <group>
      {legs > 0 && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} geometry={legGeo} material={f.oak} position={[sx * (w / 2 - 0.045), legs / 2, sz * (d / 2 - 0.045)]} castShadow />
      ))}
      <group position={[0, legs, 0]}>
        {parts.map((p, i) => <mesh key={i} geometry={p.g} material={m.concrete} position={[p.x, p.y, 0]} castShadow receiveShadow />)}
        <group position={[0, t, 0]}>
          {contents === 'games' && <GameCases width={inner.w} />}
          {contents === 'blackBox' && <Box p={[0, 0.045, 0.02]} s={[inner.w - 0.08, 0.09, d * 0.62]} m={f.blackGlass} />}
        </group>
      </group>
    </group>
  )
}

/** Stak af PS5-spilcovers stående på højkant (blå PlayStation-kant øverst). */
function GameCases({ width }: { width: number }) {
  const mats = useMemo(() => ({
    blue: new THREE.MeshStandardMaterial({ color: '#0a3d9a', roughness: 0.35 }),
    covers: ['#c63b2b', '#1c1c1e', '#e7c23c', '#2f6f4e', '#7a3fa0', '#d9d9d9', '#b35a1f'].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  }), [])
  const T = 0.015, H = 0.17, D = 0.135
  const n = 8
  const start = -width / 2 + 0.03
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[start + i * (T + 0.002) + T / 2, H / 2, 0.04]}>
          <mesh material={mats.covers[i % mats.covers.length]} castShadow><boxGeometry args={[T, H, D]} /></mesh>
          <mesh material={mats.blue} position={[0, H / 2 - 0.012, 0]}><boxGeometry args={[T + 0.001, 0.024, D + 0.001]} /></mesh>
        </group>
      ))}
      {/* Et par spil liggende ved siden af */}
      {[0, 1].map((k) => (
        <group key={`l${k}`} position={[width / 2 - 0.09, T / 2 + k * (T + 0.002), 0.04]}>
          <mesh material={mats.covers[(k + 3) % mats.covers.length]} castShadow><boxGeometry args={[D, T, H]} /></mesh>
        </group>
      ))}
    </group>
  )
}


const hifiMats = (() => {
  let c: ReturnType<typeof make> | null = null
  function make() {
    return {
      alu: new THREE.MeshStandardMaterial({ color: '#c9cbcd', roughness: 0.32, metalness: 1 }),
      black: new THREE.MeshStandardMaterial({ color: '#0e0f11', roughness: 0.25, metalness: 0.2 }),
      display: new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: '#7fb2ff', emissiveIntensity: 0.6, roughness: 0.2 }),
      cone: new THREE.MeshStandardMaterial({ color: '#d9d2c3', roughness: 0.55 }),
      grey: new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.4, metalness: 0.6 }),
      psWhite: new THREE.MeshStandardMaterial({ color: '#f4f5f7', roughness: 0.3 }),
      psBlack: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.45 }),
    }
  }
  return () => (c ??= make())
})()

/** Linn-forstærker/streamer: lav aluminiumskasse med sort front, display og drejeknap på toppen. Front mod +z. */
function LinnAmp() {
  const m = hifiMats()
  const W = 0.38, H = 0.09, D = 0.36
  return (
    <group>
      <RoundedBox args={[W, H, D]} radius={0.012} smoothness={3} position={[0, H / 2, 0]} material={m.alu} castShadow receiveShadow />
      <mesh material={m.black} position={[0, H / 2, D / 2 + 0.001]}><boxGeometry args={[W - 0.02, H - 0.025, 0.004]} /></mesh>
      <mesh material={m.display} position={[-0.05, H / 2, D / 2 + 0.004]}><boxGeometry args={[0.12, 0.022, 0.002]} /></mesh>
      <mesh material={m.alu} position={[0.08, H + 0.006, 0.06]} castShadow><cylinderGeometry args={[0.045, 0.048, 0.014, 40]} /></mesh>
    </group>
  )
}

/** Gulvstående B&W-højttaler med "tweeter on top" og afrundet kabinet. Front mod +z. */
function BWSpeaker({ color }: { color: string }) {
  const m = hifiMats()
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.38 }), [color])
  const W = 0.22, H = 1.0, D = 0.34
  const drivers = [0.82, 0.6, 0.38]
  return (
    <group>
      <mesh material={m.grey} position={[0, 0.015, 0]}><boxGeometry args={[W + 0.08, 0.03, D + 0.08]} /></mesh>
      <RoundedBox args={[W, H, D]} radius={0.05} smoothness={4} position={[0, 0.03 + H / 2, 0]} material={wood} castShadow receiveShadow />
      <mesh material={m.black} position={[0, 0.03 + H / 2, D / 2 + 0.001]}><boxGeometry args={[W - 0.03, H - 0.06, 0.004]} /></mesh>
      {drivers.map((y, i) => (
        <group key={y} position={[0, 0.03 + y, D / 2 + 0.006]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={m.grey}><cylinderGeometry args={[i === 0 ? 0.06 : 0.085, i === 0 ? 0.06 : 0.085, 0.006, 32]} /></mesh>
          <mesh material={i === 0 ? m.cone : m.cone} position={[0, 0.004, 0]}><cylinderGeometry args={[i === 0 ? 0.045 : 0.07, i === 0 ? 0.045 : 0.07, 0.004, 32]} /></mesh>
        </group>
      ))}
      {/* Separat diskanthus ovenpå */}
      <group position={[0, 0.03 + H + 0.06, 0.02]}>
        <mesh material={m.black} rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.045, 0.18, 6, 16]} /></mesh>
        <mesh material={m.alu} position={[0, 0, 0.135]}><sphereGeometry args={[0.022, 16, 12]} /></mesh>
        <mesh material={m.black} position={[0, -0.045, 0]}><cylinderGeometry args={[0.012, 0.012, 0.03, 10]} /></mesh>
      </group>
    </group>
  )
}

/** Hvid PlayStation 5 stående oprejst: sort kerne mellem to svungne hvide sideplader. Front mod +z. */
function PS5() {
  const m = hifiMats()
  return (
    <group>
      <mesh material={m.psBlack} position={[0, 0.008, 0]}><cylinderGeometry args={[0.07, 0.07, 0.016, 24]} /></mesh>
      <RoundedBox args={[0.06, 0.37, 0.24]} radius={0.01} smoothness={3} position={[0, 0.205, 0]} material={m.psBlack} castShadow />
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.04, 0.205, 0]} rotation={[0, 0, s * -0.03]}>
          <RoundedBox args={[0.016, 0.39, 0.26]} radius={0.007} smoothness={3} material={m.psWhite} castShadow />
        </group>
      ))}
    </group>
  )
}

const sevenMats = new Map<string, { leather: THREE.MeshPhysicalMaterial; chrome: THREE.MeshStandardMaterial; foot: THREE.MeshStandardMaterial }>()
function sevenMaterials(color: string) {
  let m = sevenMats.get(color)
  if (!m) sevenMats.set(color, (m = {
    leather: new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e3e6e9', roughness: 0.12, metalness: 1 }),
    foot: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 }),
  }))
  return m
}

/** Arne Jacobsens 7'er-skal: én buet flade fra sædets forkant gennem "taljen" til ryggens top. */
function sevenShellGeometry() {
  // Sideprofil (z frem, y op): forkant → sæde → talje → ryg.
  const profile = new THREE.CatmullRomCurve3([
    [0.2, 0.44], [0.12, 0.455], [0.02, 0.453], [-0.08, 0.455], [-0.15, 0.49],
    [-0.2, 0.56], [-0.225, 0.67], [-0.235, 0.76], [-0.228, 0.83],
  ].map(([z, y]) => new THREE.Vector3(0, y, z)))
  // Halv bredde langs profilen (t = 0 forkant … 1 rygtop). Sædet er rundt og smallere end ryggen,
  // som er bredest øverst ('vingerne').
  const widths: [number, number][] = [[0, 0.17], [0.08, 0.195], [0.2, 0.205], [0.33, 0.19], [0.45, 0.13], [0.55, 0.085], [0.63, 0.09], [0.75, 0.16], [0.88, 0.235], [1, 0.242]]
  const N = 44, M = 28
  // Lineær interpolation mellem nøglepunkterne, derefter udglatning, så kanten bliver en jævn kurve uden knæk.
  const lerpWidth = (t: number) => {
    for (let i = 1; i < widths.length; i++) {
      const [t0, w0] = widths[i - 1], [t1, w1] = widths[i]
      if (t <= t1) return w0 + ((w1 - w0) * (t - t0)) / (t1 - t0)
    }
    return widths[widths.length - 1][1]
  }
  let hwRow = Array.from({ length: N + 1 }, (_, i) => lerpWidth(i / N))
  for (let pass = 0; pass < 8; pass++)
    hwRow = hwRow.map((v, i) => 0.25 * hwRow[Math.max(0, i - 1)] + 0.5 * v + 0.25 * hwRow[Math.min(N, i + 1)])
  const pos: number[] = [], idx: number[] = []
  const p = new THREE.Vector3()
  for (let i = 0; i <= N; i++) {
    const t = i / N
    profile.getPoint(t, p)
    let hw = hwRow[i]
    // Afrunding af forkanten og ryggens top.
    if (t < 0.14) hw *= 0.3 + 0.7 * Math.sqrt(1 - ((0.14 - t) / 0.14) ** 2)
    if (t > 0.94) hw *= 0.85 + 0.15 * Math.sqrt(Math.max(0, 1 - ((t - 0.94) / 0.06) ** 2))
    const back = THREE.MathUtils.smoothstep(t, 0.45, 0.7)
    for (let j = 0; j <= M; j++) {
      const u = (j / M) * 2 - 1
      const x = u * hw
      // Sædet er let skålformet, ryggen krummer frem om kroppen.
      const dishY = (1 - back) * 0.016 * u * u
      const wrapZ = back * 0.05 * u * u
      const topDip = t > 0.88 ? -0.03 * (1 - u * u) * ((t - 0.88) / 0.12) : 0
      pos.push(x, p.y + dishY + topDip, p.z + wrapZ)
    }
  }
  // Overflade (sidderens side) med normaler op/frem.
  const ring = (M + 1) * (N + 1)
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1
    idx.push(a, a + 1, b, b, a + 1, b + 1)
  }
  // Midlertidige normaler til at forskyde undersiden langs.
  const tmp = new THREE.BufferGeometry()
  tmp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  tmp.setIndex(idx.slice())
  tmp.computeVertexNormals()
  const nrm = tmp.getAttribute('normal')
  const T = 0.012
  for (let k = 0; k < ring; k++) pos.push(pos[k * 3] - nrm.getX(k) * T, pos[k * 3 + 1] - nrm.getY(k) * T, pos[k * 3 + 2] - nrm.getZ(k) * T)
  // Underside: samme net, omvendt omløb.
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = ring + i * (M + 1) + j, b = a + M + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  // Kant: forbind over- og underside langs hele omkredsen.
  const edge: number[] = []
  for (let j = 0; j <= M; j++) edge.push(j)
  for (let i = 1; i <= N; i++) edge.push(i * (M + 1) + M)
  for (let j = M - 1; j >= 0; j--) edge.push(N * (M + 1) + j)
  for (let i = N - 1; i >= 1; i--) edge.push(i * (M + 1))
  for (let k = 0; k < edge.length; k++) {
    const p0 = edge[k], p1 = edge[(k + 1) % edge.length]
    idx.push(p0, p1 + ring, p1, p0, p0 + ring, p1 + ring)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
let sevenShell: THREE.BufferGeometry | null = null

/** Læderpolstret 7'er-stol på forkromede stålben. Lokalt: front mod +z. */
function SevenChair({ color = '#141414' }: { color?: string }) {
  const m = sevenMaterials(color)
  const shell = (sevenShell ??= sevenShellGeometry())
  const legs = useMemo(() => {
    const tube = new THREE.CylinderGeometry(0.0085, 0.0085, 1, 10)
    return ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) => {
      const top = new THREE.Vector3(sx * 0.11, 0.425, sz * 0.09 + 0.02)
      const foot = new THREE.Vector3(sx * 0.19, 0.012, sz * 0.17 + 0.02)
      const dir = foot.clone().sub(top)
      const len = dir.length()
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      return { mid: top.clone().add(foot).multiplyScalar(0.5), q, len, foot, tube }
    })
  }, [])
  return (
    <group>
      <mesh geometry={shell} material={m.leather} castShadow receiveShadow />
      {legs.map((l, i) => (
        <group key={i}>
          <mesh geometry={l.tube} material={m.chrome} position={l.mid} quaternion={l.q} scale={[1, l.len, 1]} castShadow />
          <mesh material={m.foot} position={[l.foot.x, 0.006, l.foot.z]}><cylinderGeometry args={[0.011, 0.011, 0.012, 10]} /></mesh>
        </group>
      ))}
      {/* Ophæng under sædet der samler benene */}
      <mesh material={m.chrome} position={[0, 0.425, 0.02]}><boxGeometry args={[0.24, 0.012, 0.03]} /></mesh>
    </group>
  )
}

/** Cylinderformet puf, polstret i velour. */
function Pouf({ color, d = 1.0, h = 0.4 }: { color: string; d?: number; h?: number }) {
  const m = velour(color)
  const r = d / 2, edge = 0.06
  return (
    <group>
      <mesh material={m} position={[0, (h - edge) / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[r, r - 0.01, h - edge, 64]} /></mesh>
      {/* Afrundet overkant (torus) + top */}
      <mesh material={m} position={[0, h - edge, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[r - edge, edge, 16, 64]} /></mesh>
      <mesh material={m} position={[0, h - edge / 2 + edge / 2, 0]} receiveShadow><cylinderGeometry args={[r - edge, r - edge, 0.002, 64]} /></mesh>
    </group>
  )
}

/** Tyk ledning langs punkter i verdenskoordinater (møblet placeres i pos [0, 0], rot 0). */
function Cable({ points, radius = 0.007, color = '#0d0d0f' }: { points: number[][]; radius?: number; color?: string }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal')
    return new THREE.TubeGeometry(curve, points.length * 16, radius, 10, false)
  }, [JSON.stringify(points), radius])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }), [color])
  return <mesh geometry={geo} material={mat} castShadow />
}

/** Drejede profiler (radius, højde) for forskellige glas og karafler. */
const glassProfiles: Record<string, [number, number][]> = {
  wine: [[0, 0], [0.032, 0], [0.033, 0.003], [0.004, 0.008], [0.004, 0.09], [0.012, 0.1], [0.034, 0.13], [0.04, 0.17], [0.036, 0.21], [0.035, 0.212]],
  red: [[0, 0], [0.036, 0], [0.037, 0.003], [0.004, 0.008], [0.004, 0.08], [0.02, 0.095], [0.048, 0.13], [0.05, 0.17], [0.04, 0.225], [0.039, 0.227]],
  flute: [[0, 0], [0.03, 0], [0.031, 0.003], [0.003, 0.008], [0.003, 0.1], [0.012, 0.11], [0.022, 0.15], [0.024, 0.22], [0.023, 0.24]],
  coupe: [[0, 0], [0.032, 0], [0.033, 0.003], [0.004, 0.008], [0.004, 0.09], [0.02, 0.1], [0.05, 0.12], [0.055, 0.13]],
  tumbler: [[0, 0], [0.034, 0], [0.036, 0.004], [0.038, 0.09], [0.0375, 0.092]],
  highball: [[0, 0], [0.03, 0], [0.031, 0.004], [0.032, 0.15], [0.0315, 0.152]],
  carafe: [[0, 0], [0.06, 0], [0.065, 0.02], [0.066, 0.1], [0.05, 0.16], [0.022, 0.2], [0.02, 0.27], [0.024, 0.28]],
  vase: [[0, 0], [0.04, 0], [0.05, 0.05], [0.045, 0.12], [0.028, 0.17], [0.032, 0.2]],
}
const glassGeoCache = new Map<string, THREE.LatheGeometry>()
const glassGeo = (k: string) => {
  let g = glassGeoCache.get(k)
  if (!g) glassGeoCache.set(k, (g = new THREE.LatheGeometry(glassProfiles[k].map(([x, y]) => new THREE.Vector2(x, y)), 24)))
  return g
}
const glassMats = (() => {
  let c: THREE.MeshPhysicalMaterial[] | null = null
  return () => (c ??= [
    ['#eef6fa', 0.36], ['#eef6fa', 0.36], ['#eef6fa', 0.36], ['#9aa3a8', 0.5], ['#b98a5a', 0.45], ['#7da3b8', 0.45],
  ].map(([color, opacity]) => new THREE.MeshPhysicalMaterial({ color: color as string, roughness: 0.02, transparent: true, opacity: opacity as number, depthWrite: false, side: THREE.DoubleSide })))
})()

/** En hylde med en blandet række glas (vin, champagne, coupe, tumbler, highball), karafler og små vaser. */
function GlassRow({ x0, x1, seed }: { x0: number; x1: number; seed: number }) {
  const items = useMemo(() => {
    let st = seed * 9973 + 17
    const rnd = () => ((st = (st * 16807) % 2147483647) / 2147483647)
    const kinds = ['wine', 'red', 'flute', 'coupe', 'tumbler', 'highball']
    const out: { k: string; x: number; z: number; m: number }[] = []
    let x = x0
    while (x < x1) {
      const special = rnd() < 0.12
      const k = special ? (rnd() < 0.5 ? 'carafe' : 'vase') : kinds[Math.floor(rnd() * kinds.length)]
      const r = Math.max(...glassProfiles[k].map((p) => p[0]))
      if (x + 2 * r > x1) break
      const mi = special ? 3 + Math.floor(rnd() * 3) : rnd() < 0.15 ? 3 : 0
      if (special || k === 'carafe') out.push({ k, x: x + r, z: 0, m: mi })
      else for (const z of [-0.07, 0.05]) out.push({ k, x: x + r, z: z + (rnd() - 0.5) * 0.02, m: mi })
      x += 2 * r + 0.012
    }
    return out
  }, [x0, x1, seed])
  const mats = glassMats()
  return <>{items.map((it, i) => <mesh key={i} geometry={glassGeo(it.k)} material={mats[it.m]} position={[it.x, 0, it.z]} />)}</>
}

/** Nederste hylde: to sorte opbevaringskasser og stakke af brætspil. */
function BottomShelfStuff({ innerW }: { innerW: number }) {
  const mats = useMemo(() => ({
    box: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.7 }),
    games: [['#c8312b', '#f4d35e'], ['#2a6fb0', '#ffffff'], ['#2f8f4e', '#f2e6c8'], ['#5b3a8c', '#f2b134'], ['#f2a33a', '#1d3557'], ['#e8e2d0', '#a4161a']]
      .map(([a, b]) => [new THREE.MeshStandardMaterial({ color: a, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: b, roughness: 0.6 })]),
  }), [])
  const games = [
    { x: 0.12, w: 0.3, d: 0.3, h: 0.07, rot: 0.04 }, { x: 0.12, w: 0.3, d: 0.3, h: 0.05, rot: -0.06 }, { x: 0.12, w: 0.27, d: 0.27, h: 0.08, rot: 0.1 },
    { x: 0.46, w: 0.28, d: 0.21, h: 0.06, rot: -0.03 }, { x: 0.46, w: 0.26, d: 0.18, h: 0.05, rot: 0.08 }, { x: 0.46, w: 0.3, d: 0.22, h: 0.07, rot: 0 },
  ]
  let lastX = -1, stackY = 0
  return (
    <group>
      {[0, 1].map((k) => (
        <RoundedBox key={k} args={[0.32, 0.24, 0.3]} radius={0.01} smoothness={2} position={[-innerW / 2 + 0.2 + k * 0.36, 0.12, 0]} material={mats.box} castShadow />
      ))}
      {games.map((g, i) => {
        if (g.x !== lastX) { lastX = g.x; stackY = 0 }
        const y = stackY + g.h / 2
        stackY += g.h + 0.002
        const [body, band] = mats.games[i % mats.games.length]
        return (
          <group key={i} position={[g.x, y, 0]} rotation={[0, g.rot, 0]}>
            <mesh material={body} castShadow><boxGeometry args={[g.w, g.h, g.d]} /></mesh>
            <mesh material={band} position={[0, g.h / 2 + 0.0006, 0]}><boxGeometry args={[g.w * 0.7, 0.001, g.d * 0.22]} /></mesh>
            <mesh material={band} position={[0, 0, g.d / 2 + 0.0006]}><boxGeometry args={[g.w * 0.6, g.h * 0.45, 0.001]} /></mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Familieportrætter tegnet på canvas (farver fra beboernes udseende) til den digitale fotoramme. */
const portraitPeople = [
  { name: 'Stephan', skin: '#f1c7a8', hair: '#9a7348', shirt: '#262c38', bg: ['#87b6d8', '#dfeaf2'], style: 'short', beard: '#a57a4f' },
  { name: 'Lisa', skin: '#f3cfb6', hair: '#d8b77a', shirt: '#1f2433', bg: ['#f2c7a0', '#fbe8d6'], style: 'long' },
  { name: 'Max-Emil', skin: '#f3d0b8', hair: '#c49a5c', shirt: '#3f7cc4', bg: ['#9fd28c', '#e4f3dc'], style: 'messy' },
  { name: 'Mathilde', skin: '#f6d6c2', hair: '#b4441f', shirt: '#e2a33b', bg: ['#c7a6f0', '#efe6fb'], style: 'pony' },
  { name: 'Hund', skin: '#c9a26b', hair: '#c9a26b', shirt: '#c9a26b', bg: ['#7cc4f2', '#a8d98a'], style: 'dog' },
  { name: 'Familien', skin: '', hair: '', shirt: '', bg: ['#f3b67a', '#5a6f8f'], style: 'group' },
]
function drawPortrait(ctx: CanvasRenderingContext2D, W: number, H: number, i: number) {
  const p = portraitPeople[i % portraitPeople.length]
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, p.bg[0]); g.addColorStop(1, p.bg[1])
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const head = (x: number, y: number, r: number, q: typeof p) => {
    ctx.fillStyle = q.shirt; ctx.beginPath(); ctx.ellipse(x, y + r * 2.6, r * 1.9, r * 1.5, 0, Math.PI, 0); ctx.fill()
    if (q.style === 'long') { ctx.fillStyle = q.hair; ctx.fillRect(x - r * 1.05, y - r * 0.2, r * 2.1, r * 1.8) }
    ctx.fillStyle = q.skin; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    if (q.beard) { ctx.fillStyle = q.beard; ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.85, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill() }
    ctx.fillStyle = q.hair; ctx.beginPath(); ctx.arc(x, y - r * 0.15, r * 1.05, Math.PI * 1.02, Math.PI * 1.98); ctx.fill()
    if (q.style === 'pony') { ctx.beginPath(); ctx.arc(x + r * 1.05, y - r * 0.2, r * 0.35, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x - r * 0.35, y + r * 0.05, r * 0.09, 0, Math.PI * 2); ctx.arc(x + r * 0.35, y + r * 0.05, r * 0.09, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#8a4a3a'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke()
  }
  if (p.style === 'dog') {
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(W / 2, H * 0.52, H * 0.26, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(W / 2 - H * 0.25, H * 0.5, H * 0.08, H * 0.18, 0.3, 0, Math.PI * 2); ctx.ellipse(W / 2 + H * 0.25, H * 0.5, H * 0.08, H * 0.18, -0.3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(W / 2 - H * 0.09, H * 0.47, H * 0.03, 0, Math.PI * 2); ctx.arc(W / 2 + H * 0.09, H * 0.47, H * 0.03, 0, Math.PI * 2); ctx.arc(W / 2, H * 0.6, H * 0.045, 0, Math.PI * 2); ctx.fill()
  } else if (p.style === 'group') {
    portraitPeople.slice(0, 4).forEach((q, k) => head(W * (0.2 + k * 0.2), H * (k < 2 ? 0.42 : 0.55), H * (k < 2 ? 0.12 : 0.1), q))
  } else head(W / 2, H * 0.45, H * 0.22, p)
}

/** Digital fotoramme på fod med et slideshow (krydsfade) af familieportrætter. Front mod +z. */
function DigitalPhotoFrame({ position }: { position: V3 }) {
  const W = 0.24, H = 0.17
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 170
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return { c, ctx: c.getContext('2d')!, t, a: document.createElement('canvas'), b: document.createElement('canvas') }
  }, [])
  const state = useRef({ shown: -1 })
  const mats = useMemo(() => ({
    screen: new THREE.MeshBasicMaterial({ map: tex.t, toneMapped: false }),
    frame: new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.35 }),
  }), [tex])
  useFrame(({ clock }) => {
    const slide = 4, fade = 0.7
    const t = clock.elapsedTime
    const i = Math.floor(t / slide), f = Math.min(1, (t % slide) / fade)
    const key = i * 100 + Math.round(f * 20)
    if (key === state.current.shown) return
    state.current.shown = key
    const { c, ctx } = tex
    ctx.globalAlpha = 1; drawPortrait(ctx, c.width, c.height, i + portraitPeople.length - 1)
    ctx.globalAlpha = f
    ctx.save(); drawPortrait(ctx, c.width, c.height, i); ctx.restore()
    ctx.globalAlpha = 1
    tex.t.needsUpdate = true
  })
  return (
    <group position={position}>
      <group position={[0, H / 2 + 0.01, 0]} rotation={[-0.15, 0, 0]}>
        <RoundedBox args={[W + 0.02, H + 0.02, 0.018]} radius={0.006} smoothness={2} material={mats.frame} castShadow />
        <mesh material={mats.screen} position={[0, 0, 0.0095]}><planeGeometry args={[W - 0.01, H - 0.01]} /></mesh>
      </group>
      <mesh material={mats.frame} position={[0, 0.06, -0.05]} rotation={[0.5, 0, 0]}><boxGeometry args={[0.03, 0.13, 0.008]} /></mesh>
    </group>
  )
}

let photoTextures: THREE.CanvasTexture[] | null = null
/** Små "familiefotos": proceduralt tegnede motiver (strand, skov, portrætter) så rammerne ikke er tomme. */
function getPhotoTextures() {
  if (photoTextures) return photoTextures
  const scenes: [string, string, string[]][] = [
    ['#7cc4f2', '#e9d39a', ['#f2c7a5', '#b4441f']], ['#9fd28c', '#4d8a3a', ['#f3cfb6', '#d8b77a']],
    ['#f3b67a', '#5a6f8f', ['#f1c7a8', '#9a7348', '#f6d6c2']], ['#dfe7ee', '#ffffff', ['#f3d0b8', '#c49a5c']],
    ['#ffd0a8', '#a67c52', ['#f2c7a5', '#b4441f', '#f3cfb6', '#9a7348']], ['#5b7fb8', '#2d4a35', ['#f1c7a8']],
  ]
  photoTextures = scenes.map(([sky, ground, people]) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 80
    const ctx = c.getContext('2d')!
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 64, 50)
    ctx.fillStyle = ground; ctx.fillRect(0, 50, 64, 30)
    people.forEach((hair, i) => {
      const x = 64 / (people.length + 1) * (i + 1), y = 54 - (i % 2) * 4
      ctx.fillStyle = ['#2f5f8f', '#e2a33b', '#7a3b3b', '#3f7cc4'][i % 4]; ctx.fillRect(x - 7, y - 4, 14, 22)
      ctx.fillStyle = '#f3cfb6'; ctx.beginPath(); ctx.arc(x, y - 10, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x, y - 12, 6.3, Math.PI, 0); ctx.fill()
    })
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return t
  })
  return photoTextures
}

/**
 * Sort vitrineskab: korpus med to glaslåger, glashylder med vinglas på rækker og små fotorammer imellem.
 * Lokalt: front mod +z, bredde langs x.
 */
function Vitrine({ w = 1.5, h = 2.0, d = 0.4 }: { w?: number; h?: number; d?: number }) {
  const mats = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.45, metalness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#c9dbe3', roughness: 0.03, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1 }),
    frames: ['#1a1a1a', '#b08d57', '#f2f0eb', '#6b4a32'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: c === '#b08d57' ? 0.6 : 0 })),
    photos: getPhotoTextures().map((t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false })),
    light: new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffe2b0', emissiveIntensity: 1.2, toneMapped: false }),
  }), [])
  const T = 0.025, plinth = 0.08
  const shelves = 5
  const innerW = w - 2 * T, innerD = d - 0.06
  const gap = (h - plinth - 2 * T) / shelves
  const shelfY = (i: number) => plinth + T + i * gap
  return (
    <group>
      {/* Korpus */}
      <Box p={[0, h / 2, -d / 2 + T / 2]} s={[w, h, T]} m={mats.body} />
      {[-1, 1].map((sx) => <Box key={sx} p={[sx * (w / 2 - T / 2), h / 2, 0]} s={[T, h, d]} m={mats.body} />)}
      <Box p={[0, h - T / 2, 0]} s={[w, T, d]} m={mats.body} />
      <Box p={[0, plinth / 2, 0]} s={[w, plinth, d]} m={mats.body} />
      <Box p={[0, plinth + T / 2, 0]} s={[innerW, T, innerD]} m={mats.body} />
      {/* Glashylder */}
      {Array.from({ length: shelves - 1 }, (_, i) => (
        <mesh key={i} material={mats.glass} position={[0, shelfY(i + 1), -0.01]}><boxGeometry args={[innerW, 0.008, innerD]} /></mesh>
      ))}
      {/* Lys i toppen */}
      <mesh material={mats.light} position={[0, h - T - 0.004, 0]}><boxGeometry args={[innerW - 0.1, 0.006, 0.03]} /></mesh>
      {/* Indhold: blandede glas, fotos, digital fotoramme (midterste hylde, venstre) og brætspil/kasser nederst */}
      {Array.from({ length: shelves }, (_, i) => {
        const y = shelfY(i) + (i === 0 ? T / 2 : 0.004)
        if (i === 0) return <group key={i} position={[0, y, 0]}><BottomShelfStuff innerW={innerW} /></group>
        const hasFrame = i === 2
        const photosHere = i === 1 || i === 3
        const x0 = -innerW / 2 + (hasFrame ? 0.34 : 0.08)
        const x1 = innerW / 2 - (photosHere ? 0.42 : 0.08)
        return (
          <group key={i} position={[0, y, 0]}>
            <GlassRow x0={x0} x1={x1} seed={i * 7 + 3} />
            {hasFrame && <DigitalPhotoFrame position={[-innerW / 2 + 0.15, 0, -0.03]} />}
            {photosHere && [0, 1].map((k) => {
              const ph = 0.18 - k * 0.04, pw = ph * 0.8, idx = (i + k * 3) % mats.photos.length
              return (
                <group key={`p${k}`} position={[innerW / 2 - 0.13 - k * 0.2, ph / 2 + 0.005, -0.05 + k * 0.06]} rotation={[-0.12, (k - 0.5) * 0.4, 0]}>
                  <mesh material={mats.frames[(i + k) % mats.frames.length]} castShadow><boxGeometry args={[pw, ph, 0.015]} /></mesh>
                  <mesh material={mats.photos[idx]} position={[0, 0, 0.0081]}><planeGeometry args={[pw - 0.03, ph - 0.03]} /></mesh>
                </group>
              )
            })}
          </group>
        )
      })}
      {/* To glaslåger med sort ramme og lille greb */}
      {[-1, 1].map((sx) => {
        const dw = w / 2 - 0.005, cx = sx * (w / 4)
        return (
          <group key={sx} position={[cx, plinth + (h - plinth) / 2, d / 2 + 0.01]}>
            <mesh material={mats.glass}><boxGeometry args={[dw - 0.04, h - plinth - 0.04, 0.006]} /></mesh>
            <Box p={[0, (h - plinth) / 2 - 0.015, 0]} s={[dw, 0.03, 0.02]} m={mats.body} />
            <Box p={[0, -(h - plinth) / 2 + 0.015, 0]} s={[dw, 0.03, 0.02]} m={mats.body} />
            {[-1, 1].map((ex) => <Box key={ex} p={[ex * (dw / 2 - 0.015), 0, 0]} s={[0.03, h - plinth, 0.02]} m={mats.body} />)}
            <Box p={[-sx * (dw / 2 - 0.05), 0, 0.016]} s={[0.012, 0.16, 0.012]} m={mats.body} />
          </group>
        )
      })}
    </group>
  )
}

/** Havebord i sort imitationstræ: plankebordplade med smalle fuger på et sort metalstel. Lokalt: længde langs x. */
function OutdoorTable({ l = 2.2, d = 1.0, color = '#1f1d1b' }: { l?: number; d?: number; color?: string }) {
  const mats = useMemo(() => ({
    wood: new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    frame: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.5 }),
  }), [color])
  const H = 0.74, T = 0.03, planks = 7
  const pw = (d - (planks - 1) * 0.006) / planks
  return (
    <group>
      {Array.from({ length: planks }, (_, i) => (
        <Box key={i} p={[0, H - T / 2, -d / 2 + pw / 2 + i * (pw + 0.006)]} s={[l, T, pw]} m={mats.wood} />
      ))}
      <Box p={[0, H - T - 0.03, 0]} s={[l - 0.12, 0.06, d - 0.12]} m={mats.frame} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x * (l / 2 - 0.08), (H - T) / 2, z * (d / 2 - 0.08)]} s={[0.05, H - T, 0.05]} m={mats.frame} />
      ))}
    </group>
  )
}

/** Grå havestol: aluminiumsstel med armlæn og sæde/ryg af tætte lameller. Lokalt: front mod +z. */
function GardenChair({ color = '#8c9094' }: { color?: string }) {
  const mats = useMemo(() => ({
    frame: new THREE.MeshStandardMaterial({ color: '#6f7377', roughness: 0.4, metalness: 0.6 }),
    slat: new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
  }), [color])
  const W = 0.46, D = 0.46, seat = 0.44
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <Box key={`${x}${z}`} p={[x * (W / 2 - 0.02), seat / 2, z * (D / 2 - 0.02)]} s={[0.03, seat, 0.03]} m={mats.frame} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <Box key={`s${i}`} p={[0, seat, -D / 2 + 0.05 + i * ((D - 0.1) / 5)]} s={[W - 0.04, 0.02, 0.06]} m={mats.slat} />
      ))}
      {/* Ryg (let bagoverhældende) */}
      <group position={[0, seat, -D / 2 + 0.02]} rotation={[-0.15, 0, 0]}>
        {[-1, 1].map((x) => <Box key={x} p={[x * (W / 2 - 0.02), 0.22, 0]} s={[0.03, 0.44, 0.03]} m={mats.frame} />)}
        {Array.from({ length: 5 }, (_, i) => <Box key={i} p={[0, 0.1 + i * 0.075, 0]} s={[W - 0.06, 0.055, 0.02]} m={mats.slat} />)}
      </group>
      {/* Armlæn */}
      {[-1, 1].map((x) => <Box key={`a${x}`} p={[x * (W / 2 - 0.02), seat + 0.17, 0]} s={[0.04, 0.03, D - 0.02]} m={mats.frame} />)}
      {[-1, 1].map((x) => <Box key={`ap${x}`} p={[x * (W / 2 - 0.02), seat + 0.085, D / 2 - 0.03]} s={[0.03, 0.17, 0.03]} m={mats.frame} />)}
    </group>
  )
}

/** Stor gasgrill: skab med låger, to sideborde, låg i rustfrit stål med greb, knapper og termometer. Front mod +z. */
function GasGrill({ w = 1.45 }: { w?: number }) {
  const m = useMemo(() => ({
    steel: new THREE.MeshStandardMaterial({ color: '#c3c6c9', roughness: 0.25, metalness: 1 }),
    black: new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.5, metalness: 0.3 }),
    knob: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.4 }),
    dial: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.3 }),
  }), [])
  const body = w * 0.62, side = (w - body) / 2, D = 0.6
  return (
    <group>
      {/* Underskab med to låger på hjul */}
      <Box p={[0, 0.45, 0]} s={[body, 0.8, D]} m={m.black} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box p={[s * body / 4, 0.45, D / 2 + 0.01]} s={[body / 2 - 0.02, 0.74, 0.015]} m={m.steel} />
          <Box p={[s * 0.04, 0.62, D / 2 + 0.035]} s={[0.015, 0.22, 0.02]} m={m.steel} />
        </group>
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => (
        <mesh key={`${x}${z}`} material={m.knob} position={[x * (body / 2 - 0.05), 0.04, z * (D / 2 - 0.06)]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
        </mesh>
      ))}
      {/* Kontrolpanel med knapper */}
      <Box p={[0, 0.9, D / 2 - 0.02]} s={[body, 0.12, 0.08]} m={m.black} />
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} material={m.knob} position={[-body / 2 + 0.1 + i * ((body - 0.2) / 3), 0.9, D / 2 + 0.035]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.03, 16]} />
        </mesh>
      ))}
      {/* Kogeboks + buet låg */}
      <Box p={[0, 1.0, -0.02]} s={[body, 0.12, D - 0.08]} m={m.black} />
      <RoundedBox args={[body + 0.01, 0.26, D - 0.06]} radius={0.1} smoothness={5} position={[0, 1.15, -0.02]} material={m.steel} castShadow />
      <mesh material={m.black} position={[0, 1.17, 0.3]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.016, 0.016, body * 0.8, 12]} /></mesh>
      <mesh material={m.dial} position={[0, 1.24, 0.25]} rotation={[1.0, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.01, 20]} /></mesh>
      {/* Sideborde */}
      {[-1, 1].map((s) => (
        <group key={`side${s}`}>
          <Box p={[s * (body / 2 + side / 2), 0.92, 0]} s={[side, 0.03, D - 0.06]} m={m.steel} />
          <Box p={[s * (body / 2 + side - 0.02), 0.86, 0]} s={[0.02, 0.1, D - 0.06]} m={m.black} />
        </group>
      ))}
    </group>
  )
}

const colorMats = new Map<string, THREE.MeshStandardMaterial>()
const colorMat = (hex: string) => {
  let m = colorMats.get(hex)
  if (!m) colorMats.set(hex, (m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95 })))
  return m
}

export interface FurnitureItem {
  id: string
  name: string
  room?: string
  kind: string
  pos: [number, number]
  y?: number
  rot?: number
  model?: string
  height?: number
  width?: number
  w?: number
  d?: number
  length?: number
  count?: number
  color?: string
  duvet?: string
  side?: 'left' | 'right'
  /** Benhøjde i meter (0 = ingen ben). */
  legs?: number
  contents?: string
  /** Brug samme stof/farve som møblet med dette id. */
  matchFabric?: string
  /** Kabel: punkter [x, y, z] i verdenskoordinater. */
  points?: number[][]
  /** Seng: dynebredde (enkeltdyne) og antal tøjdyr. */
  duvetW?: number
  plush?: number
  /** Skærmgrupper pr. PC, fx [2, 1]. */
  layout?: number[]
  /** Spil pr. skærmgruppe: "racer" | "blocks". */
  games?: string[]
  fronts?: string
}

export const furnitureItems = (furnitureData as unknown as { items: FurnitureItem[] }).items

const O: V3 = [0, 0, 0]

/** Stoffarve: enten egen 'color' eller samme som møblet 'matchFabric' peger på (så fx puf og sofa følges ad). */
function fabricColor(it: FurnitureItem, fallback: string): string {
  if (it.matchFabric) return furnitureItems.find((o) => o.id === it.matchFabric)?.color ?? fallback
  return it.color ?? fallback
}

function renderItem(it: FurnitureItem): ReactNode {
  const f = fm()
  switch (it.kind) {
    case 'model': return <Model name={it.model!} p={O} height={it.height} width={it.width} />
    case 'bed': return <Bed p={O} w={it.w ?? 0.9} l={it.length} duvet={colorMat(it.duvet ?? '#d8cdb9')} duvetW={it.duvetW} plush={it.plush} />
    case 'wardrobe': return <Wardrobe p={O} w={it.w ?? 1} d={it.d} />
    case 'desk': return <Desk p={O} w={it.w} game={it.games?.[0]} />
    case 'officeChair': return <OfficeChair p={O} />
    case 'stool': return <Stool p={O} />
    case 'toilet': return <Toilet p={O} />
    case 'vanity': return <Vanity p={O} w={it.w} />
    case 'bathtub': return <Bathtub p={O} />
    case 'shower': return <Shower p={O} />
    case 'woodStove': return <WoodStove p={O} />
    case 'tv': return <Tv p={O} width={it.width} game={it.games?.[0]} />
    case 'concreteBlock': return <ConcreteBlock w={it.w} h={it.height} d={it.d} legs={it.legs} contents={it.contents} />
    case 'linn': return <LinnAmp />
    case 'speaker': return <BWSpeaker color={it.color ?? '#8a4630'} />
    case 'ps5': return <PS5 />
    case 'sevenChair': return <SevenChair color={it.color} />
    case 'pouf': return <Pouf color={fabricColor(it, '#0c1a4f')} d={it.w} h={it.height} />
    case 'cable': return <Cable points={it.points ?? []} radius={it.width} />
    case 'vitrine': return <Vitrine w={it.w} h={it.height} d={it.d} />
    case 'outdoorTable': return <OutdoorTable l={it.w} d={it.d} color={it.color} />
    case 'gardenChair': return <GardenChair color={it.color} />
    case 'gasGrill': return <GasGrill w={it.w} />
    case 'dropTable': return <DropTable l={it.w} d={it.d} />
    case 'wingChair': return <WingChair color={it.color ?? '#b47a22'} />
    case 'chaiseSofa': return <ChaiseSofa color={fabricColor(it, '#2340a8')} w={it.w} side={it.side} />
    case 'grill': return <Grill p={O} />
    case 'walkInShelves': return <WalkInShelves p={O} w={it.w ?? 1.8} />
    case 'kitchenRun': return <KitchenRun length={it.length ?? 3} />
    case 'counter': return <Counter length={it.length ?? 2} />
    case 'tallCabinets': return <TallCabinets w={it.w ?? 2} />
    case 'kitchenIsland': return <KitchenIsland />
    case 'diningTable': return <DiningTable w={it.w ?? 2} d={it.d ?? 0.9} />
    case 'washerDryer': return <WasherDryer />
    case 'monitors': return <Monitors count={it.count ?? 1} size={it.width} layout={it.layout} games={it.games} />
    case 'workDesk': return <WorkDesk l={it.w ?? 1.6} d={it.d ?? 0.8} color={it.color} />
    case 'pcTower': return <PcTower />
    case 'keyboardMouse': return <KeyboardMouse glow={it.color} />
    case 'dresser': return <Dresser w={it.w} h={it.height} d={it.d} color={it.color} fronts={it.fronts} />
    case 'bookshelf': return <Bookshelf w={it.w} h={it.height} d={it.d} color={it.color} />
    case 'dogBed': return <Box p={[0, 0.06, 0]} s={[0.9, 0.12, 0.65]} m={f.dogBed} />
    case 'rug': return <Box p={[0, 0.006, 0]} s={[it.w ?? 1, 0.012, it.d ?? 1]} m={colorMat(it.color ?? '#cfc5b4')} shadow={false} />
    case 'ball': return <mesh material={f.ball} position={[0, 0.11, 0]} castShadow><sphereGeometry args={[0.11, 20, 14]} /></mesh>
    default:
      console.warn('Ukendt møbeltype', it.kind, it.id)
      return null
  }
}

/** Alt inventar fra data/furniture.json. Hver gruppe bærer sit møbel-id, så vektorværktøjet kan se, hvad der peges på. */
export function Furniture() {
  return (
    <group>
      {furnitureItems.map((it) => (
        <group key={it.id} position={[it.pos[0], it.y ?? 0, it.pos[1]]} rotation={[0, ((it.rot ?? 0) * Math.PI) / 180, 0]}
          userData={{ furnitureId: it.id }}>
          <Suspense fallback={null}>{renderItem(it)}</Suspense>
        </group>
      ))}
    </group>
  )
}
