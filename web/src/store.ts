import { create } from 'zustand'
import * as signalR from '@microsoft/signalr'
import type { AgentInfo, House, VectorRec, WallMode, WorldSnapshot } from './types'

interface State {
  house: House | null
  agents: AgentInfo[]
  snapshot: WorldSnapshot | null
  /** performance.now() da sidste snapshot kom — bruges til at fremskrive uret mellem snapshots. */
  snapshotAt: number
  connected: boolean

  showRoof: boolean
  wallMode: WallMode
  selectedAgent: string | null
  followAgent: boolean
  hoveredRoom: string | null
  /** Beboer der trækkes med musen lige nu. */
  dragging: string | null
  /** Aktivt værktøj: "vector" = træk pile til møbelplacering. */
  tool: 'none' | 'vector'
  vectors: VectorRec[]
  vectorDraft: VectorRec | null

  set: (p: Partial<State>) => void
}

export const useStore = create<State>((set) => ({
  house: null,
  agents: [],
  snapshot: null,
  snapshotAt: 0,
  connected: false,
  showRoof: false,
  wallMode: 'low',
  selectedAgent: null,
  followAgent: false,
  hoveredRoom: null,
  dragging: null,
  tool: 'none',
  vectors: [],
  vectorDraft: null,
  set: (p) => set(p),
}))

let connection: signalR.HubConnection | null = null
let connecting: Promise<void> | null = null

/** Idempotent — React StrictMode kalder effekter to gange i udvikling. */
export function connect() {
  return (connecting ??= doConnect())
}

async function doConnect() {
  const house = (await (await fetch('/api/house')).json()) as House
  useStore.getState().set({ house })

  connection = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/world')
    .withAutomaticReconnect()
    .build()

  connection.on('snapshot', (snapshot: WorldSnapshot) =>
    useStore.getState().set({ snapshot, snapshotAt: performance.now() }))
  connection.onreconnected(() => useStore.getState().set({ connected: true }))
  connection.onclose(() => useStore.getState().set({ connected: false }))

  await connection.start()
  const agents = await connection.invoke<AgentInfo[]>('GetAgents')
  const snapshot = await connection.invoke<WorldSnapshot>('GetSnapshot')
  useStore.getState().set({ agents, snapshot, snapshotAt: performance.now(), connected: true })
}

export const setTimeScale = (scale: number) => connection?.invoke('SetTimeScale', scale)
export const setPaused = (paused: boolean) => connection?.invoke('SetPaused', paused)
export const moveAgent = (id: string, x: number, z: number) => connection?.invoke<boolean>('MoveAgent', id, x, z)
export const pickUpAgent = (id: string) => connection?.invoke('PickUpAgent', id)
export const setAgentActive = (id: string, active: boolean) => connection?.invoke('SetAgentActive', id, active)
export const toggleDoor = (id: string) => connection?.invoke('ToggleDoor', id)
export const toggleMower = () => connection?.invoke('ToggleMower')
export const jumpToTimeOfDay = (hours: number) => connection?.invoke('JumpToTimeOfDay', hours)
export const setObstacles = (rects: { id: string; x0: number; z0: number; x1: number; z1: number }[]) =>
  connection?.invoke('SetObstacles', rects).catch((e) =>
    console.warn('Serveren kunne ikke modtage møblernes placering — er backend genstartet efter seneste opdatering?', e))

/** Simuleret tid i sekunder, fremskrevet lokalt mellem snapshots. */
export function currentSimSeconds() {
  const { snapshot, snapshotAt } = useStore.getState()
  if (!snapshot) return 12 * 3600
  if (snapshot.paused) return snapshot.simSeconds
  return snapshot.simSeconds + ((performance.now() - snapshotAt) / 1000) * snapshot.timeScale
}
