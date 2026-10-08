import type { House, Opening, P2, WallMode } from '../types'

export interface PlacedOpening {
  o: Opening
  /** Afstand langs væggen fra segmentets a-punkt til åbningens centrum. */
  s: number
  s0: number
  s1: number
  sill: number
  head: number
}

export interface WallSegment {
  id: string
  a: P2
  b: P2
  dir: P2
  /** Venstre-normal (−dir.z, dir.x). For ydervægge peger `outward` (±1) den udad. */
  n: P2
  len: number
  thickness: number
  exterior: boolean
  outward: 1 | -1
  ext0: number
  ext1: number
  openings: PlacedOpening[]
}

export function pointInPolygon(p: P2, poly: P2[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j]
    if (az > p[1] !== bz > p[1] && p[0] < ((bx - ax) * (p[1] - az)) / (bz - az) + ax) inside = !inside
  }
  return inside
}

/** Er punktet ude på plænen (inden for grunden, men hverken inde i huset, på terrassen eller i indkørslen)? */
export function isOnLawn(house: House, p: P2): boolean {
  const [[x0, z0], [x1, z1]] = house.site.bounds
  if (p[0] < x0 || p[0] > x1 || p[1] < z0 || p[1] > z1) return false
  if (pointInPolygon(p, house.exterior)) return false
  if (pointInPolygon(p, house.site.terrace)) return false
  if (pointInPolygon(p, house.site.driveway)) return false
  return true
}

export function openingHeights(o: Opening): { sill: number; head: number } {
  switch (o.type) {
    case 'window': return { sill: o.sill ?? 0.9, head: o.height ? (o.sill ?? 0.9) + o.height : 2.25 }
    case 'glassDoor': return { sill: 0, head: o.height ?? 2.25 }
    case 'frontDoor': return { sill: 0, head: o.height ?? 2.25 }
    case 'exteriorDoor': return { sill: 0, head: o.height ?? 2.2 }
    case 'garageDoor': return { sill: 0, head: o.height ?? 2.15 }
    case 'fireplace': return { sill: o.sill ?? 0.35, head: (o.sill ?? 0.35) + (o.height ?? 0.55) }
    default: return { sill: 0, head: o.height ?? 2.1 }
  }
}

/** Lille overlap/indrykning (m) der sikrer at sammenstødende vægge aldrig har sammenfaldende flader. */
const OVERLAP = 0.002

let cache: { house: House; segments: WallSegment[] } | null = null

export function layoutWalls(house: House): WallSegment[] {
  if (cache?.house === house) return cache.segments
  const raw: Omit<WallSegment, 'dir' | 'n' | 'len' | 'outward' | 'openings'>[] = []
  const ext = house.exterior
  ext.forEach((a, i) => {
    const b = ext[(i + 1) % ext.length]
    const t = house.exteriorWallThickness
    // Hjørner: segmentet dækker selv hjørnefeltet i sin slutning (ext1), og det næste starter 2 mm inde i det
    // (ext0 negativ). Så ligger ingen flader oven i hinanden (z-fighting) — før dækkede begge segmenter hjørnet.
    raw.push({ id: `ext-${i}`, a, b, thickness: t, exterior: true, ext0: -(t / 2 - OVERLAP), ext1: t / 2 })
  })
  for (const w of house.interiorWalls) {
    const t = w.thickness ?? house.interiorWallThickness
    raw.push({ id: w.id, a: w.a, b: w.b, thickness: t, exterior: false, ext0: t / 2 - OVERLAP, ext1: t / 2 - OVERLAP })
  }

  const segments = raw.map((r) => {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1]
    const len = Math.hypot(dx, dz)
    const dir: P2 = [dx / len, dz / len]
    const n: P2 = [-dir[1], dir[0]]
    const mid: P2 = [(r.a[0] + r.b[0]) / 2 + n[0] * 0.3, (r.a[1] + r.b[1]) / 2 + n[1] * 0.3]
    const outward: 1 | -1 = r.exterior && pointInPolygon(mid, ext) ? -1 : 1
    return { ...r, len, dir, n, outward, openings: [] as PlacedOpening[] }
  })

  for (const o of house.openings) {
    let best: { seg: WallSegment; s: number; d: number } | null = null
    for (const seg of segments) {
      const px = o.at[0] - seg.a[0], pz = o.at[1] - seg.a[1]
      const s = px * seg.dir[0] + pz * seg.dir[1]
      if (s < -0.01 || s > seg.len + 0.01) continue
      const d = Math.abs(px * seg.n[0] + pz * seg.n[1])
      if (d < 0.05 && (!best || d < best.d)) best = { seg, s, d }
    }
    if (!best) {
      console.warn('Åbning uden væg', o.id)
      continue
    }
    const { sill, head } = openingHeights(o)
    best.seg.openings.push({ o, s: best.s, s0: best.s - o.width / 2, s1: best.s + o.width / 2, sill, head })
  }
  for (const seg of segments) seg.openings.sort((p, q) => p.s0 - q.s0)

  cache = { house, segments }
  return segments
}

export const LOW_WALL = 1.0

/** Væghøjde for et segment givet visningstilstand og kameraets retning (xz, fra target mod kamera). */
export function wallTop(seg: WallSegment, mode: WallMode, fullHeight: number, cam: P2): number {
  if (mode === 'full') return fullHeight
  if (mode === 'low') return LOW_WALL
  if (!seg.exterior) return LOW_WALL
  const dot = (seg.n[0] * seg.outward) * cam[0] + (seg.n[1] * seg.outward) * cam[1]
  return dot > 0.15 ? LOW_WALL : fullHeight
}

/** Signatur over hvilke ydervægge der vender mod kameraet — ændrer sig kun ved kvadrant-skift. */
export function facingSignature(house: House, cam: P2) {
  return layoutWalls(house)
    .filter((s) => s.exterior)
    .map((s) => ((s.n[0] * s.outward) * cam[0] + (s.n[1] * s.outward) * cam[1] > 0.15 ? '1' : '0'))
    .join('')
}
