import type { ThreeEvent } from '@react-three/fiber'
import type { ComponentProps, ReactNode } from 'react'
import { toggleDoor, useStore } from '../store'

/**
 * Fælles klik-mekanisme for alt i scenen der kan tændes/slukkes/åbnes.
 *
 * Der er ingen knapper: man klikker direkte på selve objektet. R3F raycaster for os, og et klik på et
 * vilkårligt mesh bobler op gennem forældrene — så det er nok at sætte handlerne ét sted, på gruppen
 * omkring objektet.
 *
 * To måder at registrere et nyt klikbart objekt:
 *   1. `<Clickable onActivate={...}>…</Clickable>` omkring objektet, eller
 *   2. `<group {...clickable(...)}>` / `<mesh {...clickable(...)}>` hvis man allerede har en gruppe.
 * Deler objektet tilstand med serveren (`openDoors`), gør `{...toggleProps(id)}` det hele.
 *
 * Bemærk: StaticBatch springer objekter med klik-handlere over, så de bliver ved med at kunne rammes.
 */
export function clickable(onActivate: () => void) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      // Vektorværktøjet tegner pile oven på scenen — da må klik ikke også betjene tingene.
      if (useStore.getState().tool === 'vector') return
      e.stopPropagation()
      onActivate()
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer' },
    onPointerOut: () => { document.body.style.cursor = '' },
  }
}

/** Klik hvor som helst på indholdet aktiverer `onActivate`. `enabled={false}` gør gruppen passiv igen. */
export function Clickable({ onActivate, enabled = true, children, ...rest }: {
  onActivate: () => void
  enabled?: boolean
  children: ReactNode
} & Omit<ComponentProps<'group'>, 'onClick' | 'onPointerOver' | 'onPointerOut' | 'children'>) {
  return <group {...rest} {...(enabled ? clickable(onActivate) : {})}>{children}</group>
}

/** Genvej for ting hvis tænd/sluk-tilstand deles via serveren (døre, porte, hvidevarer, pejs, lamper). */
export const toggleProps = (id: string) => clickable(() => toggleDoor(id))
