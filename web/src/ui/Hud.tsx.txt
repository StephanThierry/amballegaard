import { useEffect, useState } from 'react'
import { currentSimSeconds, jumpToTimeOfDay, requestProfile, setAdaptive, setAgentActive, setAvatarStyle, setPaused, setQuality, setTimeScale, useStore, type AvatarStyle } from '../store'
import { MAX_LEVEL, QUALITY } from '../three/quality'
import { SUNRISE_JUMP, SUNSET_JUMP } from '../three/sun'
import { resetView, rotateView } from '../three/camera'
import type { VectorRec, WallMode } from '../types'
import { vectorText } from '../three/VectorTool'

const SPEEDS = [1, 60, 300, 1200]

const ACTIVITY: Record<string, string> = { idle: 'Står stille', walk: 'Går' }

function useClock() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT(currentSimSeconds()), 250)
    return () => clearInterval(id)
  }, [])
  const day = Math.floor(t / 86400) + 1
  const h = Math.floor((t % 86400) / 3600)
  const m = Math.floor((t % 3600) / 60)
  return { day, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
}

export function Hud() {
  const s = useStore()
  const { day, time } = useClock()
  const hovered = s.house?.rooms.find((r) => r.id === s.hoveredRoom)
  const selected = s.agents.find((a) => a.id === s.selectedAgent)
  const selState = s.snapshot?.agents.find((a) => a.id === s.selectedAgent)
  const paused = s.snapshot?.paused ?? false
  const scale = s.snapshot?.timeScale ?? 60

  const view = (mode: WallMode, roof: boolean) => s.set({ wallMode: mode, showRoof: roof })
  const viewKey = s.wallMode === 'full' ? (s.showRoof ? 'roof' : 'full') : s.wallMode

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') rotateView(-1)
      if (e.key === 'e' || e.key === 'E') rotateView(1)
      if (e.key === 'v' || e.key === 'V') { const st = useStore.getState(); st.set({ tool: st.tool === 'vector' ? 'none' : 'vector' }) }
      if (e.key === 'Escape') useStore.getState().set({ tool: 'none', vectorDraft: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div className="panel top-left">
        <div className="title">Amballegaard <span className={s.connected ? 'dot on' : 'dot'} title={s.connected ? 'Forbundet' : 'Afbrudt'} /></div>
        <a className="showcase-link" href="/showcase.html" target="_blank" rel="noreferrer">Avatar-showcase ↗</a>
        <div className="clock">Dag {day} · <b>{time}</b></div>
        <div className="row">
          <button className={paused ? 'active' : ''} onClick={() => setPaused(!paused)} title="Pause">{paused ? '▶' : '❚❚'}</button>
          {SPEEDS.map((v) => (
            <button key={v} className={!paused && scale === v ? 'active' : ''} onClick={() => { setTimeScale(v); setPaused(false) }}>
              {v === 1 ? '1×' : `${v}×`}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => jumpToTimeOfDay(SUNRISE_JUMP)} title="Spring til solopgang">
            <SunIcon rising /> Solopgang
          </button>
          <button className="icon-btn" onClick={() => jumpToTimeOfDay(SUNSET_JUMP)} title="Spring til solnedgang">
            <SunIcon rising={false} /> Solnedgang
          </button>
        </div>
        <QualityPanel />
      </div>

      <div className="panel top-right">
        <div className="label">Visning</div>
        <div className="row">
          <button className={viewKey === 'roof' ? 'active' : ''} onClick={() => view('full', true)}>Med tag</button>
          <button className={viewKey === 'full' ? 'active' : ''} onClick={() => view('full', false)}>Uden tag</button>
          <button className={viewKey === 'low' ? 'active' : ''} onClick={() => view('low', false)}>Lave vægge</button>
        </div>
        <div className="row">
          <button onClick={() => rotateView(-1)} title="Drej (Q)">⟲</button>
          <button onClick={() => resetView(s.house)}>Isometrisk</button>
          <button onClick={() => rotateView(1)} title="Drej (E)">⟳</button>
        </div>
        <div className="row">
          <button className={s.tool === 'vector' ? 'active' : ''} onClick={() => s.set({ tool: s.tool === 'vector' ? 'none' : 'vector' })}
            title="Træk med musen for at lave en vektor (V)">📐 Vektor</button>
        </div>
      </div>

      <div className="panel bottom-left">
        <div className="label">Beboere</div>
        <div className="row style-row" title="Figurstil (gælder kun for dig)">
          {([['voxel', 'Voxel'], ['pixel', 'Pixelart'], ['classic', 'Low-poly']] as [AvatarStyle, string][]).map(([k, label]) => (
            <button key={k} className={s.avatarStyle === k ? 'active' : ''} onClick={() => setAvatarStyle(k)}>{label}</button>
          ))}
        </div>
        {s.agents.map((a) => {
          const st = s.snapshot?.agents.find((x) => x.id === a.id)
          const on = st?.active !== false
          const room = on ? s.house?.rooms.find((r) => r.id === st?.roomId)?.name ?? 'Udenfor' : 'Slået fra'
          return (
            <div key={a.id} className="resident-row">
              <button className={`resident ${s.selectedAgent === a.id ? 'active' : ''} ${on ? '' : 'off'}`} disabled={!on}
                onClick={() => s.set({ selectedAgent: a.id, followAgent: true })}>
                <span className="swatch" style={{ background: a.kind === 'dog' ? a.appearance.hair : a.appearance.top }} />
                <span className="name">{a.name}</span>
                <span className="room">{room}</span>
              </button>
              <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} title={on ? 'Slå fra' : 'Slå til'}
                onClick={() => { setAgentActive(a.id, !on); if (on && s.selectedAgent === a.id) s.set({ selectedAgent: null, followAgent: false }) }}>
                <span className="knob" />
              </button>
            </div>
          )
        })}
      </div>

      {selected && selState && (
        <div className="panel bottom-right">
          <div className="title small">{selected.name}</div>
          <div>{s.house?.rooms.find((r) => r.id === selState.roomId)?.name}</div>
          <div className="muted">{ACTIVITY[selState.activity] ?? selState.activity}</div>
          <label className="check">
            <input type="checkbox" checked={s.followAgent} onChange={(e) => s.set({ followAgent: e.target.checked })} /> Følg med kameraet
          </label>
        </div>
      )}

      {(s.tool === 'vector' || s.vectors.length > 0) && <VectorPanel />}

      {hovered && <div className="hover-room">{hovered.name}</div>}
    </>
  )
}

/** Slider fra ydelse til kvalitet + adaptiv tilstand. Niveauet sættes automatisk ved første opstart. */
function QualityPanel() {
  const level = useStore((s) => s.quality)
  const adaptive = useStore((s) => s.adaptive)
  const profiling = useStore((s) => s.profiling)
  const perf = useStore((s) => s.perf)
  return (
    <div className="quality">
      <div className="label">Grafik</div>
      <div className="quality-slider">
        <span>Ydelse</span>
        <input type="range" min={0} max={MAX_LEVEL} step={1} value={level} aria-label="Grafikkvalitet"
          onChange={(e) => setQuality(Number(e.target.value))} />
        <span>Kvalitet</span>
      </div>
      <div className="quality-status muted">
        <b>{QUALITY[level].name}</b> · {perf.fps} fps
        {profiling ? ' · måler hardware…' : perf.reduced ? ` · i bevægelse ${Math.round(perf.scale * 100)} %` : ''}
      </div>
      <div className="row quality-row">
        <label className="check" title="Sænker opløsning, AO og skyggeopdatering mens kameraet bevæger sig, så det holder ~30 fps. Står kameraet stille, tegnes alt i fuld kvalitet.">
          <input type="checkbox" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} /> Adaptiv ydelse
        </label>
        <button onClick={requestProfile} disabled={profiling} title="Mål hardwaren igen og vælg niveau automatisk">Mål igen</button>
      </div>
    </div>
  )
}

function VectorPanel() {
  const s = useStore()
  const [copied, setCopied] = useState<string | null>(null)
  const latest = s.vectors.at(-1)
  const text = (v: VectorRec) => (s.house ? vectorText(v, s.house) : '')
  const copy = (what: string, label: string) => {
    navigator.clipboard?.writeText(what).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    })
  }
  return (
    <div className="panel vector-panel">
      <div className="label">Vektorer {s.tool === 'vector' && <span className="live">værktøj aktivt</span>}</div>
      {s.tool === 'vector' && (
        <div className="muted hint">Træk fra et møbel (eller et punkt) til hvor det skal hen. Teksten kopieres automatisk — indsæt den i Claude. Esc afslutter.</div>
      )}
      {latest && <pre className="vector-text">{text(latest)}</pre>}
      {s.vectors.length > 0 && (
        <div className="row">
          <button onClick={() => latest && copy(text(latest), 'seneste')}>Kopiér V{latest?.n}</button>
          {s.vectors.length > 1 && <button onClick={() => copy(s.vectors.map(text).join('\n\n'), 'alle')}>Kopiér alle ({s.vectors.length})</button>}
          <button onClick={() => s.set({ vectors: [] })}>Ryd</button>
          {copied && <span className="muted copied">Kopieret {copied} ✓</span>}
        </div>
      )}
    </div>
  )
}

/** Sol over en horisontlinje med pil op (solopgang) eller ned (solnedgang). */
function SunIcon({ rising }: { rising: boolean }) {
  return (
    <svg width="18" height="16" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 15a6 6 0 0 1 12 0" fill="#f5a524" stroke="#e08a00" />
      <path d="M2 15h20" />
      <path d="M12 3v3M4.9 7.9l1.6 1.6M19.1 7.9l-1.6 1.6" stroke="#e08a00" />
      {rising ? <path d="M12 19v-3M10 17.5l2-2 2 2" /> : <path d="M12 16v3M10 17.5l2 2 2-2" />}
    </svg>
  )
}
