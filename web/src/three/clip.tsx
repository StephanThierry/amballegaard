import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type * as THREE from 'three'
import { clippedMaterial, clippedMaterials, clipPlanesAt, getMaterials, type Materials } from './materials'

const ClipContext = createContext<number>(Infinity)

/**
 * Alt indenfor tegnes i fuld størrelse, men skæres vandret af ved `y` (ægte tværsnit — ingen skalering).
 * Vægåbningerne pakker deres indhold ind i denne, så en glasdør, en garageport eller et vindue ser ens ud
 * i alle visningstilstande og blot er klippet dér, hvor væggen er skåret over.
 *
 * `y = Infinity` slår afskæringen helt fra (fuld væghøjde), så der hverken bygges ekstra materialer eller
 * shader-varianter, når der ikke er noget at klippe.
 */
export function ClipBelow({ y, children }: { y: number; children: ReactNode }) {
  return <ClipContext.Provider value={y}>{children}</ClipContext.Provider>
}

export interface Clip {
  /** Højden der skæres ved (Infinity = ingen afskæring). */
  y: number
  /** Klippeplaner til materialer der oprettes lokalt (`clippingPlanes`-prop/parameter). */
  planes: THREE.Plane[] | null
  /** De delte materialer fra `materials.ts`, skåret over ved `y`. */
  m: Materials
  /** Skærer et vilkårligt materiale over ved `y` (cachet, så det samme materiale kun klones én gang). */
  clip: <T extends THREE.Material>(mat: T) => T
}

/** Materialer der respekterer den omgivende `<ClipBelow>`. Brug i stedet for `getMaterials()` inde i åbninger. */
export function useClip(): Clip {
  const y = useContext(ClipContext)
  return useMemo(() => {
    const on = Number.isFinite(y)
    return {
      y,
      planes: on ? clipPlanesAt(y) : null,
      m: on ? clippedMaterials(y) : getMaterials(),
      clip: <T extends THREE.Material>(mat: T) => (on ? clippedMaterial(mat, y) : mat),
    }
  }, [y])
}
