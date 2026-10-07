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
    concrete: std({ ...tex.applyRepeat(tex.concrete()) }),
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
  }
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
