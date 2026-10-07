import * as THREE from 'three'

type V3 = [number, number, number]

/** Opsamler quads med meter-UV pr. materiale-nøgle og bygger én BufferGeometry pr. nøgle. */
export class MeshBuilder<K extends string> {
  private data = new Map<K, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>()

  private bucket(key: K) {
    let b = this.data.get(key)
    if (!b) this.data.set(key, (b = { pos: [], nor: [], uv: [], idx: [] }))
    return b
  }

  /** Quad p0→p1→p2→p3 mod uret set fra normalens side. */
  quad(key: K, p: [V3, V3, V3, V3], normal: V3, uv: [[number, number], [number, number], [number, number], [number, number]]) {
    const b = this.bucket(key)
    const base = b.pos.length / 3
    for (let i = 0; i < 4; i++) {
      b.pos.push(...p[i])
      b.nor.push(...normal)
      b.uv.push(...uv[i])
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  /**
   * Orienteret kasse: origo o, akse u (længde, vandret), y op, w = u × y (tykkelse).
   * Spænder s∈[s0,s1] langs u, y∈[y0,y1], t∈[-th/2, th/2] langs w.
   */
  box(o: V3, u: V3, w: V3, s0: number, s1: number, y0: number, y1: number, th: number,
    keys: { plusW: K; minusW: K; top: K; ends: K; bottom?: K; start?: K; end?: K }, uOffset = 0) {
    if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) return
    const P = (s: number, y: number, t: number): V3 => [
      o[0] + u[0] * s + w[0] * t, o[1] + y, o[2] + u[2] * s + w[2] * t,
    ]
    const h = th / 2
    const U0 = s0 + uOffset, U1 = s1 + uOffset
    this.quad(keys.plusW, [P(s0, y0, h), P(s1, y0, h), P(s1, y1, h), P(s0, y1, h)], w,
      [[U0, y0], [U1, y0], [U1, y1], [U0, y1]])
    this.quad(keys.minusW, [P(s1, y0, -h), P(s0, y0, -h), P(s0, y1, -h), P(s1, y1, -h)], [-w[0], -w[1], -w[2]],
      [[-U1, y0], [-U0, y0], [-U0, y1], [-U1, y1]])
    this.quad(keys.top, [P(s0, y1, h), P(s1, y1, h), P(s1, y1, -h), P(s0, y1, -h)], [0, 1, 0],
      [[U0, h], [U1, h], [U1, -h], [U0, -h]])
    if (keys.bottom)
      this.quad(keys.bottom, [P(s0, y0, -h), P(s1, y0, -h), P(s1, y0, h), P(s0, y0, h)], [0, -1, 0],
        [[U0, -h], [U1, -h], [U1, h], [U0, h]])
    this.quad(keys.start ?? keys.ends, [P(s0, y0, -h), P(s0, y0, h), P(s0, y1, h), P(s0, y1, -h)], [-u[0], -u[1], -u[2]],
      [[-h, y0], [h, y0], [h, y1], [-h, y1]])
    this.quad(keys.end ?? keys.ends, [P(s1, y0, h), P(s1, y0, -h), P(s1, y1, -h), P(s1, y1, h)], u,
      [[h, y0], [-h, y0], [-h, y1], [h, y1]])
  }

  /** Lodret trekant/polygon i planet gennem o udspændt af u og y, ekstruderet ±th/2 langs w. */
  prism(o: V3, u: V3, w: V3, pts: [number, number][], th: number, keys: { plusW: K; minusW: K; edges: K }) {
    const h = th / 2
    const P = (s: number, y: number, t: number): V3 => [o[0] + u[0] * s + w[0] * t, o[1] + y, o[2] + u[2] * s + w[2] * t]
    // Fan-triangulering (konvekse polygoner) — trekanter som degenererede quads.
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[0], b = pts[i], c = pts[i + 1]
      this.quad(keys.plusW, [P(a[0], a[1], h), P(b[0], b[1], h), P(c[0], c[1], h), P(c[0], c[1], h)], w,
        [a, b, c, c])
      this.quad(keys.minusW, [P(c[0], c[1], -h), P(b[0], b[1], -h), P(a[0], a[1], -h), P(a[0], a[1], -h)],
        [-w[0], -w[1], -w[2]], [[-c[0], c[1]], [-b[0], b[1]], [-a[0], a[1]], [-a[0], a[1]]])
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const es = b[0] - a[0], ey = b[1] - a[1]
      const len = Math.hypot(es, ey)
      // Kantnormal i (u,y)-planet: (ey, -es) for mod-uret polygon
      const nu = ey / len, ny = -es / len
      const n: V3 = [u[0] * nu, ny, u[2] * nu]
      this.quad(keys.edges, [P(a[0], a[1], -h), P(b[0], b[1], -h), P(b[0], b[1], h), P(a[0], a[1], h)], n,
        [[0, -h], [len, -h], [len, h], [0, h]])
    }
  }

  build(): Map<K, THREE.BufferGeometry> {
    const out = new Map<K, THREE.BufferGeometry>()
    for (const [k, b] of this.data) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
      g.setIndex(b.idx)
      g.computeBoundingSphere()
      out.set(k, g)
    }
    return out
  }
}
