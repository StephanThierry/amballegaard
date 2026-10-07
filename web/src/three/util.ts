import * as THREE from 'three'
import type { P2 } from '../types'

/** Vandret flade fra polygon (x,z) i højde y, med meter-UV. */
export function flatShape(poly: P2[], y = 0) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const g = new THREE.ShapeGeometry(shape)
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}

/** Ekstruderet plade (fx terrasse) med top i y og tykkelse t. Meter-UV på toppen. */
export function slabShape(poly: P2[], y: number, t: number) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y - t, 0)
  return g
}

/** BoxGeometry hvor UV er i meter pr. flade (så teksturer får korrekt skala). */
export function meterBox(w: number, h: number, d: number, segs: [number, number, number] = [1, 1, 1]) {
  const g = new THREE.BoxGeometry(w, h, d, ...segs)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  const groups = g.groups
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  groups.forEach((grp, face) => {
    const index = g.getIndex()!
    const seen = new Set<number>()
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const v = index.getX(i)
      if (seen.has(v)) continue
      seen.add(v)
      uv.setXY(v, uv.getX(v) * dims[face][0], uv.getY(v) * dims[face][1])
    }
  })
  uv.needsUpdate = true
  return g
}

export function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/** Glat 3D-støj (værdistøj) til organiske forskydninger. */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const s = (t: number) => t * t * (3 - 2 * t)
  const u = s(xf), v = s(yf), w = s(zf)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const h = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz)
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v),
    w,
  )
}

/** Forskyd alle hjørner med et positionsbaseret vektorfelt — samme position → samme forskydning (ingen revner). */
export function displace(g: THREE.BufferGeometry, amount: number, freq: number, keepBottom = true) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  g.computeBoundingBox()
  const minY = g.boundingBox!.min.y
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const f = keepBottom ? Math.min(1, (y - minY) / 0.3) : 1
    pos.setXYZ(i,
      x + (noise3(x * freq, y * freq, z * freq) - 0.5) * amount * f,
      y + (noise3(x * freq + 31, y * freq + 17, z * freq + 5) - 0.5) * amount * f,
      z + (noise3(x * freq + 7, y * freq + 53, z * freq + 29) - 0.5) * amount * f)
  }
  g.computeVertexNormals()
  return g
}
