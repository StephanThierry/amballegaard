export type P2 = [number, number]

export interface Opening {
  id: string
  at: P2
  width: number
  height?: number
  sill?: number
  type: 'window' | 'glassDoor' | 'door' | 'frenchDoor' | 'slidingDoor' | 'exteriorDoor' | 'frontDoor' | 'garageDoor' | 'fireplace'
  leaves?: number
}

export interface Room {
  id: string
  name: string
  floor: 'wood' | 'tile' | 'bathTile' | 'concrete'
  poly: P2[]
}

export interface RoofDef {
  id: string
  x: P2
  z: P2
  ridgeAxis: 'x' | 'z'
  pitchDeg: number
  overhang: number
  gableEnds: ('min' | 'max')[]
}

export interface House {
  name: string
  northAngleDeg: number
  wallHeight: number
  exteriorWallThickness: number
  interiorWallThickness: number
  exterior: P2[]
  interiorWalls: { id: string; a: P2; b: P2; thickness?: number }[]
  openings: Opening[]
  rooms: Room[]
  roofs: RoofDef[]
  skylights: { roof: string; x: number; width: number; length: number }[]
  chimneys: { at: P2; height: number; radius: number }[]
  coveredTerrace: { poly: P2[]; column: P2 }
  site: {
    bounds: [P2, P2]
    terrace: P2[]
    driveway: P2[]
    hedges: { a: P2; b: P2; height: number; depth: number }[]
    retainingWalls: { a: P2; b: P2; height: number }[]
  }
}

export interface Appearance {
  skin: string
  hair: string
  hairStyle: 'shortSpiky' | 'longStraight' | 'shortMessy' | 'ponytail' | 'dog'
  top: string
  bottom: string
  height: number
  beard?: string | null
  pattern?: string | null
  feminine?: boolean
}

export interface AgentInfo {
  id: string
  name: string
  kind: 'adult' | 'child' | 'dog'
  appearance: Appearance
  homeRoomId: string
}

export interface AgentState {
  id: string
  x: number
  z: number
  heading: number
  roomId: string
  activity: string
  speech?: string | null
  active?: boolean
}

export interface WorldSnapshot {
  simSeconds: number
  timeScale: number
  paused: boolean
  agents: AgentState[]
  openDoors: string[]
  mower?: { x: number; z: number; heading: number; state: string; on: boolean }
  lamps?: Record<string, number>
}

export type WallMode = 'full' | 'cutaway' | 'low'

/** En vektor tegnet med musen: fra et punkt (evt. på et møbel) til et andet punkt. */
export interface VectorRec {
  n: number
  start: P2
  end: P2
  /** Møblet der blev peget på ved start (fra data/furniture.json). */
  startItemId?: string
}
