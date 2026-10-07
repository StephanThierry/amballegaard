import type { CameraControls } from '@react-three/drei'
import * as THREE from 'three'
import type { House } from '../types'

/** Delt reference til kamerastyringen, så UI og avatarer kan styre den uden at importere Scene. */
let controls: CameraControls | null = null

export function registerControls(c: CameraControls | null) {
  controls = c
}

export const setControlsEnabled = (on: boolean) => { if (controls) controls.enabled = on }
export const rotateView = (dir: 1 | -1) => controls?.rotate((dir * Math.PI) / 2, 0, true)

export function houseCenter(house: House) {
  const xs = house.exterior.map((p) => p[0]), zs = house.exterior.map((p) => p[1])
  return new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2)
}

export function resetView(house: House | null) {
  if (!house || !controls) return
  const c = houseCenter(house)
  controls.setLookAt(c.x + 40, 46, c.z + 40, c.x, 0, c.z, true)
  controls.zoomTo(34, true)
}
