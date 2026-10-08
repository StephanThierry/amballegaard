import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { advance, playbackOf, progressOf, type Cue, type Reaction, type Show } from './show'

/** Kanalens logo vises så længe efter at skærmen er tændt, før showet fortsætter. */
const IDENT_SECONDS = 2.8
/** Titelkortet ("nu afspilles") bliver hængende så længe efter logoet. */
const CARD_SECONDS = 7

const W = 480, H = 270
const FLOOR_Y = 150
const FEET_Y = 210
const CROWD_Y = 243
const STAGE_X = 232
const RED = '#e50914'

interface Frame {
  /** Sekunder siden skærmen blev tændt — styrer logo og titelkort. */
  onFor: number
  /** Den cue der afspilles lige nu, eller null mens logoet kører. */
  cue: Cue | null
  progress: number
}

/**
 * Tegner stand-up-scenen på et canvas der bruges som skærmtekstur: murstensvæg, spot, komikeren med
 * mikrofon og et publikum i silhuet der klapper og griner efter manuskriptets regianvisninger.
 * Oven på ligger streamingtjenestens afspiller-UI og — lige efter tænd — kanalens logo.
 */
function createScreen(show: Show) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  // Publikum: faste pladser, så de ikke hopper rundt mellem billederne.
  const crowd = Array.from({ length: 17 }, (_, i) => ({
    x: 14 + i * 28.5 + ((i * 37) % 13) - 6,
    s: 0.78 + ((i * 29) % 6) / 11,
    ph: i * 1.27,
  }))

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }

  /** Tekst med bogstavmellemrum (canvas' letterSpacing er ikke til at regne med overalt). */
  const spaced = (text: string, cx: number, y: number, gap: number) => {
    const w = [...text].map((ch) => ctx.measureText(ch).width)
    let x = cx - (w.reduce((a, b) => a + b, 0) + gap * (text.length - 1)) / 2
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], x, y)
      x += w[i] + gap
    }
  }

  const drawRoom = () => {
    // Murstensvæg i klubben
    ctx.fillStyle = '#140e0c'
    ctx.fillRect(0, 0, W, FLOOR_Y)
    const bw = 40, bh = 17
    for (let row = 0; row * bh < FLOOR_Y; row++) {
      for (let col = -1; col * bw < W + bw; col++) {
        const n = ((row * 31 + col * 17) % 7) / 7
        ctx.fillStyle = `rgb(${44 + n * 16}, ${28 + n * 11}, ${24 + n * 9})`
        ctx.fillRect(col * bw + (row % 2 ? bw / 2 : 0) + 2, row * bh + 2, bw - 4, bh - 4)
      }
    }
    // Klubbens skilt på bagvæggen — til højre, så afspillerens titelkort i venstre side ikke dækker det
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,170,70,0.75)'
    ctx.font = 'bold 15px Georgia, serif'
    ctx.fillText('HONORABLE', 406, 48)
    ctx.fillText('PRIMATE', 406, 66)
    ctx.strokeStyle = 'rgba(255,170,70,0.3)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(358, 30, 96, 46)
    ctx.textAlign = 'left'
    // Spot på væggen bag komikeren
    const sp = ctx.createRadialGradient(STAGE_X, 70, 8, STAGE_X, 70, 165)
    sp.addColorStop(0, 'rgba(255,214,150,0.42)')
    sp.addColorStop(1, 'rgba(255,214,150,0)')
    ctx.fillStyle = sp
    ctx.fillRect(0, 0, W, FLOOR_Y)
    // Scenegulv + lyspøl
    ctx.fillStyle = '#0f0b0a'
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y)
    ctx.save()
    ctx.translate(STAGE_X, FEET_Y + 4)
    ctx.scale(1, 0.2)
    const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, 125)
    pool.addColorStop(0, 'rgba(255,205,135,0.55)')
    pool.addColorStop(1, 'rgba(255,205,135,0)')
    ctx.fillStyle = pool
    ctx.beginPath()
    ctx.arc(0, 0, 125, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** Barstol med vandflaske — standard-rekvisitten på enhver stand-up-scene. */
  const drawStool = () => {
    ctx.fillStyle = '#23262c'
    rr(104, 176, 44, 6, 3)
    ctx.fillRect(108, 182, 4, 28)
    ctx.fillRect(140, 182, 4, 28)
    ctx.fillRect(110, 194, 32, 3)
    ctx.fillStyle = 'rgba(190,225,235,0.85)'
    rr(120, 160, 9, 17, 3)
    ctx.fillStyle = '#5f8fa8'
    ctx.fillRect(122, 157, 5, 4)
  }

  const drawMicStand = () => {
    ctx.strokeStyle = '#2b2e35'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(STAGE_X + 66, FEET_Y)
    ctx.lineTo(STAGE_X + 66, 138)
    ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(STAGE_X + 66, 138)
    ctx.lineTo(STAGE_X + 84, 132)
    ctx.stroke()
    ctx.fillStyle = '#2b2e35'
    ctx.beginPath()
    ctx.ellipse(STAGE_X + 66, FEET_Y + 1, 15, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** Tim Cardigan: fuldskæg, strikcardigan og mikrofonen oppe ved munden. */
  const drawComedian = (t: number, speaking: boolean) => {
    const sway = Math.sin(t * 0.65) * 3
    const hy = 124
    ctx.save()
    ctx.translate(STAGE_X + sway, 0)
    // Skygge
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.ellipse(0, FEET_Y + 3, 26, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    // Ben og sko
    ctx.fillStyle = '#242831'
    rr(-14, 164, 12, 46, 3)
    rr(2, 164, 12, 46, 3)
    ctx.fillStyle = '#131519'
    rr(-17, 204, 17, 7, 3)
    rr(1, 204, 17, 7, 3)
    // T-shirt
    ctx.fillStyle = '#ddd7c9'
    rr(-17, 138, 34, 40, 5)
    // Cardigan: to åbne forstykker med knapper
    ctx.fillStyle = '#9a7238'
    rr(-26, 136, 21, 48, 6)
    rr(5, 136, 21, 48, 6)
    ctx.fillStyle = '#7a5828'
    for (const by of [146, 156, 166]) ctx.fillRect(6, by, 3, 3)
    // Arme: højre holder mikrofonen oppe, venstre gestikulerer mens han taler
    ctx.strokeStyle = '#9a7238'
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    const gest = speaking ? Math.sin(t * 2.3) * 0.5 : -0.1
    ctx.beginPath()
    ctx.moveTo(-21, 144)
    ctx.lineTo(-30, 164)
    ctx.lineTo(-30 + Math.cos(gest) * 16, 164 - Math.sin(gest + 0.5) * 14)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(21, 144)
    ctx.lineTo(26, 158)
    ctx.lineTo(13, hy + 16)
    ctx.stroke()
    // Hoved
    ctx.fillStyle = '#e8c3a2'
    ctx.beginPath()
    ctx.arc(0, hy, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6b4a2c'
    ctx.beginPath()
    ctx.arc(0, hy - 5, 13.5, Math.PI * 1.02, Math.PI * 1.98)
    ctx.fill()
    // Fuldskæg
    ctx.beginPath()
    ctx.ellipse(0, hy + 2, 13.5, 15, 0, 0.1, Math.PI - 0.1)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0, hy + 10, 10, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    // Mund i skægget, åbner når han taler
    ctx.fillStyle = '#3a1d16'
    ctx.beginPath()
    ctx.ellipse(0, hy + 6, 3.2, speaking ? 1.4 + Math.abs(Math.sin(t * 13)) * 3.4 : 1, 0, 0, Math.PI * 2)
    ctx.fill()
    // Øjne
    ctx.fillStyle = '#2a1a12'
    ctx.fillRect(-6, hy - 1.5, 2.6, 2.6)
    ctx.fillRect(3.4, hy - 1.5, 2.6, 2.6)
    // Mikrofon
    ctx.save()
    ctx.translate(12, hy + 14)
    ctx.rotate(-0.55)
    ctx.fillStyle = '#1b1d21'
    rr(-2.5, -2, 5, 18, 2.5)
    ctx.fillStyle = '#737983'
    ctx.beginPath()
    ctx.arc(0, -3, 4.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.restore()
  }

  /** Publikum i modlys. Reaktionen afgør om de griner (vipper og hopper) eller klapper (hænder op). */
  const drawCrowd = (t: number, reaction: Reaction | null) => {
    for (const p of crowd) {
      const bob = reaction === 'laughter' ? Math.sin(t * 9 + p.ph) * 4
        : reaction === 'applause' ? Math.sin(t * 6 + p.ph) * 2
          : Math.sin(t * 1.1 + p.ph) * 1.2
      ctx.save()
      ctx.translate(p.x, CROWD_Y + bob)
      ctx.scale(p.s, p.s)
      if (reaction === 'laughter') ctx.rotate(Math.sin(t * 4.5 + p.ph) * 0.13)
      ctx.fillStyle = '#05060a'
      ctx.beginPath()
      ctx.ellipse(0, 36, 27, 24, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(0, 0, 13, 0, Math.PI * 2)
      ctx.fill()
      if (reaction === 'applause') {
        const clap = Math.abs(Math.sin(t * 11 + p.ph)) * 6
        for (const s of [-1, 1]) {
          ctx.beginPath()
          ctx.ellipse(s * (5 + clap), -23, 5, 7.5, s * 0.3, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,196,120,0.35)'
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
      }
      // Varm kantbelysning oppefra, så silhuetterne læses mod det mørke gulv
      ctx.strokeStyle = 'rgba(255,196,120,0.4)'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(0, 0, 13, Math.PI * 1.12, Math.PI * 1.92)
      ctx.stroke()
      ctx.restore()
    }
    if (reaction === 'laughter') {
      ctx.font = 'bold 14px system-ui, sans-serif'
      ctx.fillStyle = '#ffd9a0'
      for (let i = 0; i < 5; i++) {
        const u = (t * 0.6 + i * 0.21) % 1
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.8
        ctx.fillText('HA', 52 + i * 88 + Math.sin(t * 2 + i) * 7, CROWD_Y - 14 - u * 46)
      }
      ctx.globalAlpha = 1
    }
  }

  /** Streamingtjenestens afspiller: logo, titel og statuslinje. */
  const drawPlayerUi = (alpha: number, f: Frame) => {
    ctx.globalAlpha = alpha
    const top = ctx.createLinearGradient(0, 0, 0, 86)
    top.addColorStop(0, 'rgba(0,0,0,0.85)')
    top.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = top
    ctx.fillRect(0, 0, W, 86)
    ctx.fillStyle = RED
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillText(show.service, 14, 26)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.fillText(show.title, 14, 50)
    ctx.fillStyle = '#c9cdd2'
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillText(`${show.host} · ${show.kicker}`, 14, 68)
    const bar = ctx.createLinearGradient(0, H - 40, 0, H)
    bar.addColorStop(0, 'rgba(0,0,0,0)')
    bar.addColorStop(1, 'rgba(0,0,0,0.8)')
    ctx.fillStyle = bar
    ctx.fillRect(0, H - 40, W, 40)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(14, H - 16, W - 28, 3)
    ctx.fillStyle = RED
    ctx.fillRect(14, H - 16, (W - 28) * f.progress, 3)
    ctx.beginPath()
    ctx.arc(14 + (W - 28) * f.progress, H - 14.5, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  /**
   * Kanalens ident: et højt rødt bogstav der zoomer på plads med navnetrækket under —
   * samme slags åbningsbumper som en streamingtjeneste ruller når man trykker play.
   */
  const drawIdent = (p: number) => {
    // Hele identen tegnes med kaldernes globalAlpha, så den kan tone over i showet til sidst.
    const outer = ctx.globalAlpha
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const pop = 1 + 0.32 * Math.exp(-p * 13)
    ctx.save()
    ctx.translate(W / 2, H * 0.47)
    ctx.scale(pop, pop * 1.1)
    const g = ctx.createLinearGradient(0, -62, 0, 46)
    g.addColorStop(0, '#ff3a46')
    g.addColorStop(0.55, RED)
    g.addColorStop(1, '#88040c')
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(229,9,20,0.75)'
    ctx.shadowBlur = 34
    ctx.font = '900 128px system-ui, "Arial Black", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(show.service[0], 0, 44)
    ctx.shadowBlur = 0
    ctx.restore()
    ctx.globalAlpha = outer * Math.min(1, Math.max(0, (p - 0.18) * 5))
    ctx.fillStyle = '#f3f3f3'
    ctx.font = 'bold 17px system-ui, sans-serif'
    ctx.textAlign = 'left'
    spaced(show.service, W / 2, H * 0.82, 7)
    ctx.globalAlpha = outer
    ctx.textAlign = 'left'
  }

  return {
    texture,
    dispose: () => texture.dispose(),
    update(t: number, f: Frame) {
      drawRoom()
      drawStool()
      drawMicStand()
      drawComedian(t, f.cue?.kind === 'line')
      drawCrowd(t, f.cue?.reaction ?? null)
      // Titelkortet lige efter identen, og derefter et kort gensyn hvert 50. sekund.
      const card = f.onFor < IDENT_SECONDS + CARD_SECONDS
        ? Math.min(1, (IDENT_SECONDS + CARD_SECONDS - f.onFor) / 1.5)
        : Math.max(0, Math.sin((((f.onFor - 6) % 50) / 50) * Math.PI) * 6 - 5)
      if (card > 0) drawPlayerUi(card, f)
      if (f.onFor < IDENT_SECONDS) {
        const p = f.onFor / IDENT_SECONDS
        ctx.globalAlpha = Math.min(1, (1 - p) * 4.5)
        drawIdent(p)
        ctx.globalAlpha = 1
      }
      texture.needsUpdate = true
    },
  }
}

/**
 * Skærmbilledet på et tændt tv. Showet fortsætter hvor det slap (positionen ligger uden for React,
 * se `show.ts`), og den aktuelle replik vises som taleboble over tv'et — samme boble som beboernes.
 */
export function ShowScreen({ id, show, w, h, position }: {
  id: string
  show: Show
  w: number
  h: number
  position: [number, number, number]
}) {
  const screen = useMemo(() => createScreen(show), [show])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }), [screen])
  const [cue, setCue] = useState<Cue | null>(null)
  const st = useRef({ onFor: 0, shown: null as Cue | null, drawn: -1 })

  useEffect(() => () => { screen.dispose(); mat.dispose() }, [screen, mat])

  useFrame(({ clock }, dt) => {
    const s = st.current
    s.onFor += dt
    const p = playbackOf(id)
    // Mens kanalens logo kører står showet stille — så starter det præcis hvor man slap.
    if (s.onFor >= IDENT_SECONDS) advance(p, show, dt)
    const c = s.onFor >= IDENT_SECONDS ? show.cues[p.cue] : null
    if (c !== s.shown) {
      s.shown = c
      setCue(c)
    }
    // ~20 fps er rigeligt for en skærm i baggrunden.
    if (clock.elapsedTime - s.drawn < 1 / 20) return
    s.drawn = clock.elapsedTime
    screen.update(clock.elapsedTime, { onFor: s.onFor, cue: c, progress: progressOf(p, show) })
  })

  return (
    <>
      <mesh material={mat} position={position}><planeGeometry args={[w, h]} /></mesh>
      {cue && (
        <Html position={[0, h / 2 + 0.22, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="avatar-label">
            <div className={cue.kind === 'reaction' ? 'bubble tv reaction' : 'bubble tv'}>
              {cue.note && <em>{cue.note}</em>}
              {cue.kind === 'reaction' ? `${cue.reaction === 'applause' ? '👏' : '😄'} ${cue.text}` : cue.text}
            </div>
          </div>
        </Html>
      )}
    </>
  )
}
