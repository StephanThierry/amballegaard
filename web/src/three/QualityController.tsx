import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { applyAnisotropy, gpuName, guessLevel, levelDpr, MAX_LEVEL, QUALITY, qualityRuntime, readStoredQuality, storeQuality } from './quality'

/** Kameraet regnes som "i bevægelse" så længe det har flyttet sig inden for dette tidsrum. */
const MOTION_HOLD_MS = 200
/** Under bevægelse tegnes skyggekortet højst hver 6. frame — skyggerne flytter sig ikke med kameraet. */
const MOTION_SHADOW_EVERY = 6
const MIN_DPR = 0.5
const MIN_SCALE = 0.35

interface Bench {
  /** Målingen starter først efter dette tidspunkt (shaderne kompileres efter niveauskift). */
  until: number
  deltas: number[]
  wentDown: boolean
  probingUp: boolean
}

/**
 * Hardware-profilering ved opstart + adaptiv ydelse under kamerabevægelse.
 *
 * Profilering: gæt et niveau ud fra GPU-navnet, mål frametider og gå ned indtil scenen holder ~30 fps
 * (eller prøv et niveau op, hvis der er luft). Resultatet gemmes pr. GPU, så næste opstart er straks klar.
 * Adaptiv: mens kameraet bevæger sig slås AO fra, skyggekortet tegnes sjældnere, og opløsningen
 * skaleres ned efter behov; når kameraet står stille, tegnes alt igen i fuld kvalitet.
 */
export function QualityController({ ao }: { ao: RefObject<{ enabled: boolean } | null> }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const setDpr = useThree((s) => s.setDpr)
  const level = useStore((s) => s.quality)
  const profileRequest = useStore((s) => s.profileRequest)
  const q = QUALITY[level]

  const r = useRef({
    last: 0, ema: 16.7, lastPublish: 0,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), zoom: 0, lastMove: -1e9,
    scale: 1, winFrames: 0, winStart: 0,
    bench: null as Bench | null, gpu: '',
  })

  useEffect(() => {
    applyAnisotropy(scene, Math.min(q.anisotropy, gl.capabilities.getMaxAnisotropy()))
    // Teksturer der indlæses senere (fx møbler ved hot reload) får niveauet med lidt forsinkelse.
    const t = setTimeout(() => applyAnisotropy(scene, Math.min(q.anisotropy, gl.capabilities.getMaxAnisotropy())), 3000)
    return () => clearTimeout(t)
  }, [gl, scene, q])

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __gl: gl, __scene: scene })
  }, [gl, scene])

  // Profilér ved første opstart på denne GPU, eller når brugeren beder om det.
  useEffect(() => {
    const st = r.current
    st.gpu = gpuName(gl)
    const saved = readStoredQuality()
    const stale = !saved || (saved.source === 'auto' && saved.gpu !== st.gpu)
    if (profileRequest === 0 && !stale) return
    const guess = guessLevel(st.gpu)
    console.info(`[kvalitet] GPU "${st.gpu}", ${navigator.hardwareConcurrency} kerner → første gæt: ${QUALITY[guess].name}`)
    useStore.getState().set({ quality: guess, profiling: true })
    st.bench = { until: performance.now() + (profileRequest === 0 ? 2500 : 1500), deltas: [], wentDown: false, probingUp: false }
  }, [gl, profileRequest])

  useFrame(() => {
    const st = r.current
    const now = performance.now()
    const ms = now - st.last
    st.last = now
    const store = useStore.getState()
    // Fanen var skjult eller browseren hakkede kraftigt — tæl ikke med.
    const valid = ms > 0 && ms < 250 && !document.hidden
    if (valid) st.ema = st.ema * 0.9 + ms * 0.1

    const moved = !camera.position.equals(st.pos) || !camera.quaternion.equals(st.quat) || camera.zoom !== st.zoom
    if (moved) {
      st.pos.copy(camera.position)
      st.quat.copy(camera.quaternion)
      st.zoom = camera.zoom
      st.lastMove = now
    }
    const moving = now - st.lastMove < MOTION_HOLD_MS

    if (st.bench && !store.profiling) st.bench = null // brugeren flyttede slideren undervejs
    if (st.bench && valid) runBench(st.bench, ms, now, st.gpu)

    const reduce = store.adaptive && moving && !st.bench
    if (reduce && valid) {
      // Juster opløsningen mod ~30-50 fps ud fra målinger over små vinduer.
      if (st.winFrames === 0) st.winStart = now
      st.winFrames++
      const span = now - st.winStart
      if (span > 400) {
        const fps = (st.winFrames - 1) / (span / 1000)
        if (fps < 30) st.scale = Math.max(MIN_SCALE, st.scale * 0.8)
        else if (fps > 50) st.scale = Math.min(1, st.scale * 1.1)
        st.winFrames = 0
      }
    } else st.winFrames = 0

    const base = levelDpr(store.quality)
    const dpr = reduce ? Math.max(MIN_DPR, Math.min(base, base * st.scale)) : base
    if (Math.abs(gl.getPixelRatio() - dpr) > 0.01) setDpr(dpr)
    qualityRuntime.shadowEvery = reduce ? Math.max(MOTION_SHADOW_EVERY, q.shadowEvery) : q.shadowEvery
    if (ao.current) ao.current.enabled = !reduce

    if (now - st.lastPublish > 500) {
      st.lastPublish = now
      const fps = Math.round(1000 / st.ema)
      const p = store.perf
      if (p.fps !== fps || p.reduced !== reduce || p.scale !== st.scale) store.set({ perf: { fps, reduced: reduce, scale: st.scale } })
    }
  })

  return null
}

function runBench(b: Bench, ms: number, now: number, gpu: string) {
  if (now < b.until) return
  b.deltas.push(ms)
  if (b.deltas.length < 90 && now - b.until < 2000) return

  const sorted = [...b.deltas].sort((x, y) => x - y)
  const med = sorted[Math.floor(sorted.length / 2)]
  const p90 = sorted[Math.floor(sorted.length * 0.9)]
  const st = useStore.getState()
  const level = st.quality
  // Under ~30 fps (eller hyppige hak) er for langsomt; 60 fps-skærme med luft giver medianen ~16,7 ms.
  const tooSlow = med > 35 || p90 > 45
  const headroom = med < 17.5 && p90 < 21
  console.info(`[kvalitet] ${QUALITY[level].name}: median ${(1000 / med).toFixed(0)} fps, p90 ${(1000 / p90).toFixed(0)} fps`)

  const go = (l: number) => {
    st.set({ quality: l })
    b.until = now + 1500
    b.deltas = []
  }
  const finish = (l: number) => {
    st.set({ quality: l, profiling: false })
    storeQuality({ level: l, adaptive: st.adaptive, source: 'auto', gpu })
    console.info(`[kvalitet] valgt: ${QUALITY[l].name}`)
  }

  if (b.probingUp) {
    // Det højere niveau skal stadig være flydende, ellers tilbage til det forrige.
    if (med > 25 || p90 > 33) finish(level - 1)
    else if (headroom && level < MAX_LEVEL) go(level + 1)
    else finish(level)
  } else if (tooSlow && level > 0) {
    b.wentDown = true
    go(level - 1)
  } else if (!b.wentDown && headroom && level < MAX_LEVEL) {
    b.probingUp = true
    go(level + 1)
  } else finish(level)
}
