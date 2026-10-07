import { useMemo } from 'react'
import type { House, P2, WallMode } from '../types'
import { layoutWalls, pointInPolygon, wallTop } from './layout'
import { getMaterials } from './materials'
import { MeshBuilder } from './meshBuilder'

type Key = 'brick' | 'plaster' | 'cap'

/** Bygger alle vægge som tre sammenflettede geometrier (tegl, puds, snitflade). */
export function Walls({ house, mode, cam }: { house: House; mode: WallMode; cam: P2 }) {
  const mats = getMaterials()
  const geoms = useMemo(() => {
    const mb = new MeshBuilder<Key>()
    const H = house.wallHeight
    layoutWalls(house).forEach((seg) => {
      const top = wallTop(seg, mode, H, cam)
      const o: [number, number, number] = [seg.a[0], 0, seg.a[1]]
      const u: [number, number, number] = [seg.dir[0], 0, seg.dir[1]]
      const w: [number, number, number] = [seg.n[0], 0, seg.n[1]]
      const outerIsPlus = seg.outward === 1
      const keys = {
        plusW: (seg.exterior && outerIsPlus ? 'brick' : 'plaster') as Key,
        minusW: (seg.exterior && !outerIsPlus ? 'brick' : 'plaster') as Key,
        top: 'cap' as Key,
        ends: (seg.exterior ? 'brick' : 'plaster') as Key,
      }
      const reveal = { ...keys, ends: 'plaster' as Key, top: 'plaster' as Key, bottom: 'plaster' as Key }

      // Endefladen i hjørnet: tegl hvis den vender ud mod det fri, puds hvis den vender ind i et rum (indadgående hjørner).
      const endKey = (s: number): Key => {
        if (!seg.exterior) return 'plaster'
        const p: P2 = [seg.a[0] + seg.dir[0] * s, seg.a[1] + seg.dir[1] * s]
        return pointInPolygon(p, house.exterior) ? 'plaster' : 'brick'
      }
      const startKey = endKey(-seg.ext0 - 0.05)
      const finalKey = endKey(seg.len + seg.ext1 + 0.05)

      // Sokkel ned til terræn — bliver synlig som dørtrin i åbningerne.
      if (seg.exterior) mb.box(o, u, w, -seg.ext0, seg.len + seg.ext1, -0.16, 0, seg.thickness, { ...keys, top: 'cap', start: startKey, end: finalKey })

      let s = -seg.ext0
      for (const op of seg.openings) {
        mb.box(o, u, w, s, op.s0, 0, top, seg.thickness, { ...keys, ends: 'plaster', start: s === -seg.ext0 ? startKey : 'plaster' })
        if (op.sill > 0) mb.box(o, u, w, op.s0, op.s1, 0, Math.min(op.sill, top), seg.thickness, { ...reveal, top: 'plaster' })
        if (op.head < top) mb.box(o, u, w, op.s0, op.s1, op.head, top, seg.thickness, { ...reveal, top: 'cap' })
        s = op.s1
      }
      mb.box(o, u, w, s, seg.len + seg.ext1, 0, top, seg.thickness, { ...keys, start: s === -seg.ext0 ? startKey : 'plaster', end: finalKey })
    })
    return mb.build()
  }, [house, mode, cam])

  return (
    <group>
      {[...geoms].map(([key, g]) => (
        <mesh key={key} geometry={g} material={key === 'brick' ? mats.brick : key === 'plaster' ? mats.plaster : mats.wallCap}
          castShadow receiveShadow />
      ))}
    </group>
  )
}
