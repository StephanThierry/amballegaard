import * as THREE from 'three'

/**
 * Grafikniveauer fra "Ydelse" (0) til "Kvalitet" (4).
 * Tunge ting (skyggetype/-størrelse, rumlys, efterbehandling) skifter kun når niveauet skifter,
 * fordi de kræver at shaderne kompileres igen. Under kamerabevægelse i adaptiv tilstand ændres kun
 * billige ting: opløsning, AO og hvor tit skyggekortet tegnes.
 */
export interface QualitySettings {
  name: string
  /** Højeste pixelratio (begrænses også af skærmens devicePixelRatio). */
  dpr: number
  shadows: false | 'basic' | 'pcf'
  shadowMap: number
  /** Tegn skyggekortet hver n'te frame (skyggerne afhænger ikke af kameraet). */
  shadowEvery: number
  /** Varme punktlys i rummene om natten — hvert lys koster på alle pixels. */
  roomLights: boolean
  /** Efterbehandling (SMAA, tone mapping, evt. bloom og AO). */
  post: boolean
  bloom: boolean
  ao: false | 'performance' | 'low' | 'medium' | 'high'
  aoHalfRes: boolean
  anisotropy: number
  /** Slå statiske møbler sammen til få meshes (færre draw calls — vigtigst på svage CPU'er). */
  batch: boolean
}

export const QUALITY: QualitySettings[] = [
  { name: 'Minimal', dpr: 0.75, shadows: false, shadowMap: 1024, shadowEvery: 1, roomLights: false, post: false, bloom: false, ao: false, aoHalfRes: true, anisotropy: 1, batch: true },
  { name: 'Lav', dpr: 1, shadows: 'basic', shadowMap: 1024, shadowEvery: 3, roomLights: false, post: true, bloom: false, ao: false, aoHalfRes: true, anisotropy: 2, batch: true },
  { name: 'Mellem', dpr: 1.25, shadows: 'pcf', shadowMap: 2048, shadowEvery: 2, roomLights: true, post: true, bloom: true, ao: 'performance', aoHalfRes: true, anisotropy: 4, batch: true },
  { name: 'Høj', dpr: 1.5, shadows: 'pcf', shadowMap: 4096, shadowEvery: 1, roomLights: true, post: true, bloom: true, ao: 'medium', aoHalfRes: false, anisotropy: 8, batch: false },
  { name: 'Ultra', dpr: 2, shadows: 'pcf', shadowMap: 4096, shadowEvery: 1, roomLights: true, post: true, bloom: true, ao: 'high', aoHalfRes: false, anisotropy: 16, batch: false },
]
export const MAX_LEVEL = QUALITY.length - 1

export const levelDpr = (level: number) => Math.min(window.devicePixelRatio || 1, QUALITY[level].dpr)

/** Delt mellem QualityController og Lighting uden React-gengivelser. */
export const qualityRuntime = { shadowEvery: 1 }

/** GPU-navnet fra driveren, fx "ANGLE (Intel, Intel(R) UHD Graphics (0x000046D1) Direct3D11 ...)". */
export function gpuName(gl: THREE.WebGLRenderer) {
  const ctx = gl.getContext()
  const ext = ctx.getExtension('WEBGL_debug_renderer_info')
  return String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
}

/** Første gæt ud fra GPU-navn og antal kerner; målingen bagefter justerer op eller ned. */
export function guessLevel(gpu: string, cores = navigator.hardwareConcurrency || 0) {
  const g = gpu.toLowerCase()
  if (/swiftshader|llvmpipe|basic render|software/.test(g)) return 0
  let level = 2
  if (/rtx|radeon rx [5-9]\d{3}|apple m\d+ (pro|max|ultra)/.test(g)) level = 4
  else if (/gtx|quadro|arc|radeon rx|radeon pro|apple m\d/.test(g)) level = 3
  else if (/iris xe|[78]80m|890m/.test(g)) level = 2
  else if (/uhd|hd graphics|intel|mali|adreno|powervr|apple gpu/.test(g)) level = 1
  if (cores > 0 && cores <= 4) level = Math.min(level, 1)
  return level
}

/** Sæt anisotropisk filtrering på alle teksturer i scenen (kræver genupload af dem der allerede er indlæst). */
export function applyAnisotropy(scene: THREE.Object3D, value: number) {
  const seen = new Set<THREE.Texture>()
  scene.traverse((o) => {
    const mat = (o as THREE.Mesh).material
    if (!mat) return
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      for (const v of Object.values(m)) {
        if (!(v instanceof THREE.Texture) || seen.has(v) || v.anisotropy === value) continue
        seen.add(v)
        v.anisotropy = value
        const img = v.image as { width?: number; data?: unknown } | null
        if (img && (img.width || img.data)) v.needsUpdate = true
      }
    }
  })
}

export interface StoredQuality {
  level: number
  adaptive: boolean
  /** "auto" = sat af hardware-profileringen, "user" = valgt med slideren. */
  source: 'auto' | 'user'
  gpu?: string
}
const KEY = 'amballegaard.quality'

export function readStoredQuality(): StoredQuality | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as StoredQuality | null
    return v && Number.isInteger(v.level) && v.level >= 0 && v.level <= MAX_LEVEL ? v : null
  } catch { return null }
}

export function storeQuality(v: StoredQuality) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* privat vindue o.l. */ }
}
