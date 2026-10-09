import { create } from 'zustand'
import * as signalR from '@microsoft/signalr'
import type { AgentInfo, House, VectorRec, WallMode, WorldSnapshot } from './types'
import { readStoredQuality, storeQuality } from './three/quality'

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
  /** Figurstil for beboerne (kun denne browser). */
  avatarStyle: AvatarStyle
  /** Aktivt værktøj: "vector" = træk pile til møbelplacering. */
  tool: 'none' | 'vector'
  vectors: VectorRec[]
  vectorDraft: VectorRec | null
  /** Grafikniveau 0 (ydelse) … 4 (kvalitet), se three/quality.ts. */
  quality: number
  /** Sænk opløsning/AO/skyggeopdatering mens kameraet bevæger sig, så fps holdes over ~30. */
  adaptive: boolean
  /** Hardware-profilering kører (sat af QualityController). */
  profiling: boolean
  /** Tæller — når den stiger, profilerer QualityController hardwaren igen. */
  profileRequest: number
  perf: { fps: number; reduced: boolean; scale: number }

  set: (p: Partial<State>) => void
}

const storedQuality = readStoredQuality()

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
  avatarStyle: readStoredStyle() ?? 'voxel',
  tool: 'none',
  vectors: [],
  vectorDraft: null,
  quality: storedQuality?.level ?? 2,
  adaptive: storedQuality?.adaptive ?? true,
  profiling: false,
  profileRequest: 0,
  perf: { fps: 0, reduced: false, scale: 1 },
  set: (p) => set(p),
}))

/** Brugerens valg på slideren vinder over profileringen (gemmes lokalt pr. browser). */
export function setQuality(level: number) {
  const st = useStore.getState()
  st.set({ quality: level, profiling: false })
  storeQuality({ level, adaptive: st.adaptive, source: 'user', gpu: readStoredQuality()?.gpu })
}
export function setAdaptive(adaptive: boolean) {
  useStore.getState().set({ adaptive })
  const saved = readStoredQuality()
  storeQuality({ level: useStore.getState().quality, adaptive, source: saved?.source ?? 'user', gpu: saved?.gpu })
}
export const requestProfile = () => useStore.getState().set({ profileRequest: useStore.getState().profileRequest + 1 })

export type AvatarStyle = 'voxel' | 'pixel' | 'classic'
const STYLE_KEY = 'amballegaard.avatarStyle'
function readStoredStyle(): AvatarStyle | null {
  try { const v = localStorage.getItem(STYLE_KEY); return v === 'voxel' || v === 'pixel' || v === 'classic' ? v : null } catch { return null }
}
/** Vælg figurstil for denne browser (gemmes lokalt, påvirker ikke andre brugere). */
export function setAvatarStyle(style: AvatarStyle) {
  try { localStorage.setItem(STYLE_KEY, style) } catch { /* privat vindue o.l. */ }
  useStore.getState().set({ avatarStyle: style })
}

let connection: signalR.HubConnection | null = null
let connecting: Promise<void> | null = null

/** Idempotent — React StrictMode kalder effekter to gange i udvikling. */
export function connect() {
  return (connecting ??= doConnect())
}

async function doConnect() {
  const house = (await (await fetch('/api/house')).json()) as House
  useStore.getState().set({ house })
  // Serverens standardstil bruges kun hvis brugeren ikke selv har valgt en.
  if (!readStoredStyle()) {
    try {
      const cfg = await (await fetch('/api/config')).json() as { defaultAvatarStyle?: string }
      const s = cfg.defaultAvatarStyle
      if (s === 'voxel' || s === 'pixel' || s === 'classic') useStore.getState().set({ avatarStyle: s })
    } catch { /* ældre server uden /api/config */ }
  }

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
export const shiftTime = (minutes: number) => connection?.invoke('ShiftTime', minutes)
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