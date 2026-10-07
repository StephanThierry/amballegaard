import * as THREE from 'three'

/**
 * Procedurale PBR-teksturer genereret i canvas, så materialerne matcher husets fotos
 * (lys gul/grå blødstrøgen tegl, store lyse klinker, betonfliser, sort tagpap, bøgehæk).
 * Alle teksturer er i meter-UV: repeat = 1 / (tekstur-størrelse i meter).
 */

type Maps = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; repeat: [number, number] }

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Glat værdistøj (bilineær interpolation af et tilfældigt gitter). */
function valueNoise(w: number, h: number, cell: number, rand: () => number) {
  const gw = Math.ceil(w / cell) + 2
  const gh = Math.ceil(h / cell) + 2
  const grid = new Float32Array(gw * gh).map(() => rand())
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const gy = y / cell
    const y0 = Math.floor(gy)
    const fy = gy - y0
    const sy = fy * fy * (3 - 2 * fy)
    for (let x = 0; x < w; x++) {
      const gx = x / cell
      const x0 = Math.floor(gx)
      const fx = gx - x0
      const sx = fx * fx * (3 - 2 * fx)
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1]
      const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1]
      out[y * w + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
    }
  }
  return out
}

function fbm(w: number, h: number, seed: number, cells: number[]) {
  const rand = rng(seed)
  const out = new Float32Array(w * h)
  let amp = 1, total = 0
  for (const c of cells) {
    const n = valueNoise(w, h, c, rand)
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
  return out
}

function canvasTexture(w: number, h: number, fill: (img: ImageData) => void, srgb: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  fill(img)
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.generateMipmaps = true
  return tex
}

function normalFromHeight(w: number, h: number, height: Float32Array, strength: number) {
  return canvasTexture(w, h, (img) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const l = height[y * w + ((x - 1 + w) % w)], r = height[y * w + ((x + 1) % w)]
        const u = height[((y - 1 + h) % h) * w + x], d = height[((y + 1) % h) * w + x]
        let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1
        const len = Math.hypot(nx, ny, nz)
        nx /= len; ny /= len; nz /= len
        const i = (y * w + x) * 4
        img.data[i] = (nx * 0.5 + 0.5) * 255
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255
        img.data[i + 3] = 255
      }
    }
  }, false)
}

function grayTexture(w: number, h: number, values: Float32Array) {
  return canvasTexture(w, h, (img) => {
    for (let i = 0; i < values.length; i++) {
      const v = Math.max(0, Math.min(1, values[i])) * 255
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 255
    }
  }, false)
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Et gitter af "blokke" (mursten/fliser) med fuge. Fælles grundlag for tegl, klinker og fliser. */
function blockPattern(opts: {
  sizeM: [number, number]
  pxPerM: number
  block: [number, number]
  joint: number
  rowOffset: number
  palette: { color: string; weight: number }[]
  jointColor: string
  tone: number
  speckle: number
  bevel: number
  jointDepth: number
  roughness: [number, number]
  normalStrength: number
  seed: number
}): Maps {
  const W = Math.round(opts.sizeM[0] * opts.pxPerM)
  const H = Math.round(opts.sizeM[1] * opts.pxPerM)
  const rand = rng(opts.seed)
  const bw = opts.block[0] + opts.joint, bh = opts.block[1] + opts.joint
  const rows = Math.round(opts.sizeM[1] / bh)
  const cols = Math.round(opts.sizeM[0] / bw)
  const grain = fbm(W, H, opts.seed + 1, [48, 12, 3])
  const fine = fbm(W, H, opts.seed + 2, [2, 1])
  const totalWeight = opts.palette.reduce((s, p) => s + p.weight, 0)

  // Farve og tone pr. blok (wrap-sikkert indekseret)
  const blockColor: [number, number, number][] = []
  const blockTone: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let pick = rand() * totalWeight
      const p = opts.palette.find((e) => (pick -= e.weight) < 0) ?? opts.palette[0]
      blockColor.push(hexToRgb(p.color))
      blockTone.push(1 + (rand() - 0.5) * opts.tone)
    }
  }
  const jointRgb = hexToRgb(opts.jointColor)
  const height = new Float32Array(W * H)
  const rough = new Float32Array(W * H)

  const map = canvasTexture(W, H, (img) => {
    for (let y = 0; y < H; y++) {
      const my = y / opts.pxPerM
      const row = Math.floor(my / bh) % rows
      const fy = my - Math.floor(my / bh) * bh
      const off = (row % 2) * opts.rowOffset * bw
      for (let x = 0; x < W; x++) {
        const mx = x / opts.pxPerM + off
        const col = ((Math.floor(mx / bw) % cols) + cols) % cols
        const fx = mx - Math.floor(mx / bw) * bw
        const i = y * W + x
        const inJoint = fx > opts.block[0] || fy > opts.block[1]
        const g = grain[i], f = fine[i]
        let rgb: [number, number, number]
        if (inJoint) {
          const t = 0.9 + f * 0.2
          rgb = [jointRgb[0] * t, jointRgb[1] * t, jointRgb[2] * t]
          height[i] = 0
          rough[i] = opts.roughness[1]
        } else {
          const idx = row * cols + col
          const tone = blockTone[idx] * (0.92 + g * 0.16) * (1 - opts.speckle * (f > 0.72 ? (f - 0.72) * 3 : 0))
          const base = blockColor[idx]
          rgb = [base[0] * tone, base[1] * tone, base[2] * tone]
          const edge = Math.min(fx, opts.block[0] - fx, fy, opts.block[1] - fy)
          height[i] = Math.min(1, opts.jointDepth + edge / opts.bevel) * (0.96 + g * 0.08)
          rough[i] = opts.roughness[0] + (g - 0.5) * 0.12
        }
        img.data[i * 4] = Math.min(255, rgb[0])
        img.data[i * 4 + 1] = Math.min(255, rgb[1])
        img.data[i * 4 + 2] = Math.min(255, rgb[2])
        img.data[i * 4 + 3] = 255
      }
    }
  }, true)

  return {
    map,
    normalMap: normalFromHeight(W, H, height, opts.normalStrength),
    roughnessMap: grayTexture(W, H, rough),
    repeat: [1 / opts.sizeM[0], 1 / opts.sizeM[1]],
  }
}

/** Lys blødstrøgen tegl i løberforbandt (228×54 mm + 12 mm fuge), enkelte mørke sten som på fotoene. */
export function brick(): Maps {
  return blockPattern({
    sizeM: [0.96 * 2, 0.066 * 30], pxPerM: 640, block: [0.228, 0.054], joint: 0.012, rowOffset: 0.5,
    palette: [
      { color: '#e6dcc6', weight: 40 }, { color: '#ddd0b4', weight: 30 }, { color: '#eadfca', weight: 18 },
      { color: '#d6c39f', weight: 8 }, { color: '#b9ab98', weight: 3 }, { color: '#6f6a66', weight: 1.4 },
    ],
    jointColor: '#d2cdc3', tone: 0.12, speckle: 0.25, bevel: 0.008, jointDepth: 0.15,
    roughness: [0.86, 0.95], normalStrength: 3.5, seed: 11,
  })
}

/** Store lyse klinker 60×60 (entré, alrum, bryggers). */
export function lightTiles(): Maps {
  return blockPattern({
    sizeM: [2.4, 2.4], pxPerM: 400, block: [0.597, 0.597], joint: 0.003, rowOffset: 0,
    palette: [{ color: '#e3ded5', weight: 1 }, { color: '#dfd9cf', weight: 1 }],
    jointColor: '#bdb6aa', tone: 0.03, speckle: 0.05, bevel: 0.002, jointDepth: 0.6,
    roughness: [0.42, 0.8], normalStrength: 2, seed: 21,
  })
}

/** Mørkere grå fliser 30×60 til badeværelser. */
export function bathTiles(): Maps {
  return blockPattern({
    sizeM: [1.8, 1.8], pxPerM: 500, block: [0.597, 0.297], joint: 0.003, rowOffset: 0.5,
    palette: [{ color: '#8f8d8a', weight: 1 }, { color: '#888682', weight: 1 }],
    jointColor: '#6f6c68', tone: 0.04, speckle: 0.05, bevel: 0.002, jointDepth: 0.6,
    roughness: [0.35, 0.8], normalStrength: 2, seed: 31,
  })
}

/** Grå betonfliser 40×40 til terrasse. */
export function pavers(): Maps {
  return blockPattern({
    sizeM: [3.2, 3.2], pxPerM: 220, block: [0.396, 0.396], joint: 0.004, rowOffset: 0,
    palette: [{ color: '#9c9890', weight: 3 }, { color: '#928e86', weight: 2 }, { color: '#a5a199', weight: 2 }],
    jointColor: '#7d7a73', tone: 0.06, speckle: 0.5, bevel: 0.006, jointDepth: 0.3,
    roughness: [0.9, 1], normalStrength: 3, seed: 41,
  })
}

/** Betonsten 20×10 i indkørslen. */
export function drivewayStones(): Maps {
  return blockPattern({
    sizeM: [2.4, 2.4], pxPerM: 260, block: [0.396, 0.196], joint: 0.004, rowOffset: 0.5,
    palette: [{ color: '#8f8b84', weight: 3 }, { color: '#86827b', weight: 2 }, { color: '#97938b', weight: 2 }],
    jointColor: '#706d66', tone: 0.06, speckle: 0.5, bevel: 0.005, jointDepth: 0.3,
    roughness: [0.92, 1], normalStrength: 3, seed: 51,
  })
}

/** Ensfarvet flade med støj: beton, puds, tagpap. */
function noiseSurface(opts: {
  size: number; px: number; color: string; variation: number; cells: number[]; roughness: number;
  roughVar: number; normalStrength: number; seed: number; granular?: number
}): Maps {
  const N = opts.px
  const n = fbm(N, N, opts.seed, opts.cells)
  const fine = fbm(N, N, opts.seed + 7, [1.5, 1])
  const base = hexToRgb(opts.color)
  const height = new Float32Array(N * N)
  const rough = new Float32Array(N * N)
  const map = canvasTexture(N, N, (img) => {
    for (let i = 0; i < N * N; i++) {
      const g = opts.granular ? (fine[i] - 0.5) * opts.granular : 0
      const t = 1 + (n[i] - 0.5) * opts.variation + g
      img.data[i * 4] = Math.min(255, base[0] * t)
      img.data[i * 4 + 1] = Math.min(255, base[1] * t)
      img.data[i * 4 + 2] = Math.min(255, base[2] * t)
      img.data[i * 4 + 3] = 255
      height[i] = n[i] * 0.4 + fine[i] * 0.6
      rough[i] = opts.roughness + (fine[i] - 0.5) * opts.roughVar
    }
  }, true)
  return {
    map,
    normalMap: normalFromHeight(N, N, height, opts.normalStrength),
    roughnessMap: grayTexture(N, N, rough),
    repeat: [1 / opts.size, 1 / opts.size],
  }
}

export const concrete = () =>
  noiseSurface({ size: 3, px: 512, color: '#a8a59f', variation: 0.18, cells: [64, 16, 4], roughness: 0.8, roughVar: 0.2, normalStrength: 1.5, seed: 61 })

export const plaster = () =>
  noiseSurface({ size: 2, px: 512, color: '#f3f1ec', variation: 0.025, cells: [40, 8], roughness: 0.93, roughVar: 0.05, normalStrength: 0.6, seed: 71 })

export const roofFelt = () =>
  noiseSurface({ size: 1.5, px: 512, color: '#34373b', variation: 0.15, cells: [32, 6], roughness: 0.88, roughVar: 0.2, normalStrength: 4, seed: 81, granular: 0.5 })

/** Tætklippet bøgehæk: mange små blade i varierende grønne nuancer. */
export function hedge(): Maps {
  const N = 512, size = 1.2
  const rand = rng(91)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1f3514'
  ctx.fillRect(0, 0, N, N)
  const heightCanvas = document.createElement('canvas')
  heightCanvas.width = heightCanvas.height = N
  const hctx = heightCanvas.getContext('2d')!
  hctx.fillStyle = '#000'
  hctx.fillRect(0, 0, N, N)
  const greens = ['#3f6b22', '#4f7d2a', '#5c8c31', '#365e1d', '#6b9a3a', '#2f5219', '#78a443']
  for (let i = 0; i < 5200; i++) {
    const x = rand() * N, y = rand() * N, r = 5 + rand() * 9, a = rand() * Math.PI
    const depth = rand()
    for (const [dx, dy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(a)
      ctx.fillStyle = greens[Math.floor(rand() * greens.length)]
      ctx.globalAlpha = 0.6 + depth * 0.4
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
      hctx.save(); hctx.translate(x + dx, y + dy); hctx.rotate(a)
      const v = Math.floor(80 + depth * 175)
      hctx.fillStyle = `rgb(${v},${v},${v})`
      hctx.beginPath(); hctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2); hctx.fill()
      hctx.restore()
    }
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  const hd = hctx.getImageData(0, 0, N, N).data
  const height = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) height[i] = hd[i * 4] / 255
  const rough = new Float32Array(N * N).fill(0.75)
  return { map, normalMap: normalFromHeight(N, N, height, 6), roughnessMap: grayTexture(N, N, rough), repeat: [1 / size, 1 / size] }
}

/** Anvender meter-repeat på alle maps og returnerer props til MeshStandardMaterial. */
export function applyRepeat(m: Maps, scale = 1) {
  for (const t of [m.map, m.normalMap, m.roughnessMap]) t.repeat.set(m.repeat[0] * scale, m.repeat[1] * scale)
  return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap }
}
