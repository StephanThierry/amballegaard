import { useMemo } from 'react'
import type { House } from '../types'
import { useStore } from '../store'
import { floorMaterial, getMaterials } from './materials'
import { flatShape, slabShape } from './util'

export function Floors({ house }: { house: House }) {
  const mats = getMaterials()
  const set = useStore((s) => s.set)
  const floors = useMemo(() => house.rooms.map((r) => ({ room: r, geom: flatShape(r.poly, 0.004) })), [house])
  // Pladen ligger 3 mm under gulv/sokkel, så dens top ikke falder sammen med soklens top i dørtrinene.
  const slab = useMemo(() => slabShape(house.exterior, -0.003, 0.3), [house])
  const covered = useMemo(() => flatShape(house.coveredTerrace.poly, -0.055), [house])

  return (
    <group>
      <mesh geometry={slab} material={mats.slab} receiveShadow />
      {floors.map(({ room, geom }) => (
        <mesh key={room.id} geometry={geom} material={floorMaterial(mats, room.floor)} receiveShadow
          onPointerMove={(e) => { e.stopPropagation(); if (useStore.getState().hoveredRoom !== room.id) set({ hoveredRoom: room.id }) }}
          onPointerOut={() => set({ hoveredRoom: null })} />
      ))}
      <mesh geometry={covered} material={mats.pavers} receiveShadow />
    </group>
  )
}
