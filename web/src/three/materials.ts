import * as THREE from 'three'
import * as tex from './textures'

/** Delte materialer. Oprettes én gang (teksturgenerering koster ~100 ms). */
export type Materials = ReturnType<typeof createMaterials>

let cached: Materials | null = null

export function getMaterials(): Materials {
  return (cached ??= createMaterials())
}

function loadPbr(name: string, sizeM: number, srgbTint?: THREE.ColorRepresentation) {
  const loader = new THREE.TextureLoader()
  const load = (suffix: string, srgb: boolean) => {
    const t = loader.load(`/assets/tex/${name}_${suffix}.jpg`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1 / sizeM, 1 / sizeM)
    t.anisotropy = 8
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    return t
  }
  return new THREE.MeshStandardMaterial({
    map: load('diff', true),
    normalMap: load('nor', false),
    roughnessMap: load('rough', false),
    aoMap: load('ao', false),
    color: srgbTint ?? '#ffffff',
  })
}

function createMaterials() {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)

  const brick = std({ ...tex.applyRepeat(tex.brick()), normalScale: new THREE.Vector2(1.2, 1.2) })
  const plaster = std({ ...tex.applyRepeat(tex.plaster()) })
  const wood = loadPbr('wood_floor', 2.2, '#f2e2cc')
  const lawn = loadPbr('leafy_grass', 2.5, '#a9e35f')
  const hedge = std({ ...tex.applyRepeat(tex.hedge()), normalScale: new THREE.Vector2(1.5, 1.5) })
  const roof = std({ ...tex.applyRepeat(tex.roofFelt()) })

  return {
    brick,
    plaster,
    wallCap: std({ color: '#d9d4ca', roughness: 0.9 }),
    wood,
    tile: std({ ...tex.applyRepeat(tex.lightTiles()) }),
    bathTile: std({ ...tex.applyRepeat(tex.bathTiles()) }),
    /** Garagegulv: trafikgrå epoxy (RAL 7042), glat og let blank — ingen tekstur. */
    concrete: std({ color: '#8f8f8c', roughness: 0.3, metalness: 0.05 }),
    pavers: std({ ...tex.applyRepeat(tex.pavers()) }),
    driveway: std({ ...tex.applyRepeat(tex.drivewayStones()) }),
    lawn,
    hedge,
    roof,
    roofSeam: std({ color: '#2b2d30', roughness: 0.5, metalness: 0.6 }),
    zinc: std({ color: '#2f3236', roughness: 0.45, metalness: 0.7 }),
    frame: std({ color: '#2c2f34', roughness: 0.4, metalness: 0.5 }),
    whiteFrame: std({ color: '#f5f5f2', roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#c9dbe3', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.22,
      envMapIntensity: 2.5, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false,
    }),
    /** Indvendigt dørglas: synligere end vinduesglas, med let blågrå tone og refleks, så ruderne læses som glas mod hvide vægge. */
    doorGlass: new THREE.MeshPhysicalMaterial({
      color: '#8fb2c4', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.5,
      envMapIntensity: 3, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false,
    }),
    garageDoor: std({ color: '#2e3135', roughness: 0.5, metalness: 0.45 }),
    soil: std({ color: '#4a3726', roughness: 1 }),
    soilDark: std({ color: '#3a2b1e', roughness: 1 }),
    slab: std({ color: '#bdb8ae', roughness: 0.95 }),
    blocks: std({ ...tex.applyRepeat(tex.concrete(), 2), color: '#c9c5bc' }),
    /** Stuens TV-betonblokke: glat, ensfarvet beton med meget lidt tekstur. */
    tvBlockConcrete: std({ color: '#c7c3ba', roughness: 0.42 }),
  }
}

// ---------------------------------------------------------------------------
// Afskæring (tværsnit)
//
// I "Lave vægge" skæres væggene over i 1 m. Alt der sidder i en vægåbning (vinduer, døre, porte, pejs)
// skal se præcis ud som i fuld højde og blot være skåret over samme sted — ikke klemt sammen.
// Det gøres med three's lokale klippeplaner: hvert materiale får en klon med et vandret plan,
// og klonerne cachelagres, så der kun findes ét ekstra materiale pr. (materiale, højde).
// ---------------------------------------------------------------------------

const keyOf = (y: number) => Math.round(y * 1000)

const planeCache = new Map<number, THREE.Plane[]>()

/** Vandret klippeplan: alt over `y` tegnes ikke. */
export function clipPlanesAt(y: number): THREE.Plane[] {
  const k = keyOf(y)
  let p = planeCache.get(k)
  if (!p) planeCache.set(k, (p = [new THREE.Plane(new THREE.Vector3(0, -1, 0), y)]))
  return p
}

const clipCache = new Map<string, THREE.Material>()
const variants = new Map<string, THREE.Material[]>()

function variantList(mat: THREE.Material) {
  let l = variants.get(mat.uuid)
  if (!l) variants.set(mat.uuid, (l = [mat]))
  return l
}

/**
 * Klon af `mat` skåret vandret over ved `y`. Uigennemsigtige flader tegnes dobbeltsidet, så snitfladen
 * viser indersiden af fx en karm i stedet for et hul. Skyggerne klippes med, så en halv dør ikke
 * kaster skygge som en hel.
 */
export function clippedMaterial<T extends THREE.Material>(mat: T, y: number): T {
  const key = `${mat.uuid}|${keyOf(y)}`
  const hit = clipCache.get(key)
  if (hit) return hit as T
  const c = mat.clone() as T
  c.clippingPlanes = clipPlanesAt(y)
  c.clipShadows = true
  if (!c.transparent) {
    c.side = THREE.DoubleSide
    // Behold three's normale skyggeside for enkeltsidede materialer — dobbeltsidede skygger giver
    // skyggeartefakter på de tynde plader (dørblade, beklædning), som vi lige har gjort dobbeltsidede.
    c.shadowSide = THREE.BackSide
  }
  clipCache.set(key, c)
  variantList(mat).push(c)
  return c
}

const clippedSets = new Map<number, Materials>()

/** Alle de delte materialer, skåret over ved `y`. */
export function clippedMaterials(y: number): Materials {
  const k = keyOf(y)
  let set = clippedSets.get(k)
  if (!set) {
    const base = getMaterials() as unknown as Record<string, THREE.Material>
    set = Object.fromEntries(Object.entries(base).map(([name, mat]) => [name, clippedMaterial(mat, y)])) as unknown as Materials
    clippedSets.set(k, set)
  }
  return set
}

/** Materialet selv plus alle dets afskårne kloner — fx når glassets natglød skal opdateres alle steder. */
export function variantsOf<T extends THREE.Material>(mat: T): readonly T[] {
  return variantList(mat) as T[]
}

export function floorMaterial(m: Materials, floor: string) {
  switch (floor) {
    case 'wood': return m.wood
    case 'tile': return m.tile
    case 'bathTile': return m.bathTile
    case 'concrete': return m.concrete
    default: return m.tile
  }
}
