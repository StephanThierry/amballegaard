import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DIR_NAMES, FAMILY, PX_PER_M, dirFromMove, drawPerson, poseFor, type Dir, type PixelPerson } from './pixelFamily'
import './showcase.css'

const ctl = { speed: 1, walking: true }

/**
 * Fælles scene set skråt ovenfra (som huset): familien går rundt om et tæppe på en afrundet rute, så alle
 * 8 retninger bruges. Spritesne sorteres efter dybde (y), så de der er tættest på tegnes forrest.
 */
function Parade() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!
    const W = c.width, H = c.height
    const cx = W / 2, cy = H / 2 + 14, rx = 92, ry = 30
    const walkers = FAMILY.map((p, i) => ({ p, t: (i / FAMILY.length) * Math.PI * 2, phase: i * 1.3, amt: 1, dir: 2 as Dir, x: 0, y: 0 }))
    let last = performance.now(), raf = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      drawFloor(ctx, W, H, cx, cy, rx, ry)
      for (const w of walkers) {
        w.amt += ((ctl.walking ? 1 : 0) - w.amt) * Math.min(1, dt * 4)
        const dog = w.p.hairStyle === 'dog'
        w.phase += dt * ctl.speed * (dog ? 9 : w.p.child ? 7 : 6) * Math.max(0.12, w.amt)
        w.t += dt * ctl.speed * 0.22 * w.amt
        // Superellipse (afrundet rektangel) så der er lige strækninger i alle 4 hovedretninger + svingene imellem.
        const pt = (t: number) => {
          const s = Math.sin(t), co = Math.cos(t), e = 0.45
          return [cx + rx * Math.sign(co) * Math.abs(co) ** e, cy + ry * Math.sign(s) * Math.abs(s) ** e]
        }
        const [x, y] = pt(w.t), [x2, y2] = pt(w.t + 0.02)
        w.x = x; w.y = y
        if (w.amt > 0.05) w.dir = dirFromMove(x2 - x, (y2 - y) * 2.2)
      }
      for (const w of [...walkers].sort((a, b) => a.y - b.y))
        drawPerson(ctx, Math.round(w.x), Math.round(w.y), w.p, poseFor(w.p, w.phase, w.amt), w.dir)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} width={280} height={130} className="pixel-canvas parade" />
}

function drawFloor(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, rx: number, ry: number) {
  ctx.imageSmoothingEnabled = false
  // Bagvæg
  ctx.fillStyle = '#ece7df'; ctx.fillRect(0, 0, W, 34)
  ctx.fillStyle = '#2c2f34'; ctx.fillRect(170, 4, 58, 26)
  ctx.fillStyle = '#9fd0f0'; ctx.fillRect(172, 6, 54, 15)
  ctx.fillStyle = '#4f8a35'; ctx.fillRect(172, 21, 54, 7)
  ctx.fillStyle = '#2c2f34'; ctx.fillRect(198, 6, 2, 22)
  ctx.fillStyle = '#1b1c1e'; ctx.fillRect(46, 8, 22, 16)
  ctx.fillStyle = '#e63946'; ctx.fillRect(48, 10, 8, 12); ctx.fillStyle = '#2a9d8f'; ctx.fillRect(56, 10, 10, 6); ctx.fillStyle = '#e9c46a'; ctx.fillRect(56, 16, 10, 6)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 31, W, 3)
  // Trægulv (planker der løber i dybden)
  for (let y = 34; y < H; y++) {
    const row = Math.floor((y - 34) / 6)
    ctx.fillStyle = row % 2 ? '#b07b4c' : '#a6713f'; ctx.fillRect(0, y, W, 1)
  }
  ctx.fillStyle = '#8f5f33'
  for (let y = 34; y < H; y += 6) for (let x = ((y * 13) % 41); x < W; x += 41) ctx.fillRect(x, y, 1, 6)
  // Tæppe i midten
  ctx.fillStyle = '#3b3d40'
  ctx.beginPath(); ctx.ellipse(cx, cy, rx - 26, ry - 10, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#4a4d51'
  ctx.beginPath(); ctx.ellipse(cx, cy, rx - 32, ry - 13, 0, 0, Math.PI * 2); ctx.fill()
}

/** Kort: stor sprite der drejer rundt gennem alle 8 retninger + en række med alle retninger samtidig. */
function PersonCard({ p }: { p: PixelPerson }) {
  const big = useRef<HTMLCanvasElement>(null)
  const strip = useRef<HTMLCanvasElement>(null)
  const [dirLabel, setDirLabel] = useState('')
  useEffect(() => {
    const c = big.current!, ctx = c.getContext('2d')!
    const s = strip.current!, sctx = s.getContext('2d')!
    let phase = 0, amt = 1, last = performance.now(), raf = 0, spin = 0, lastDir = -1
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      amt += ((ctl.walking ? 1 : 0) - amt) * Math.min(1, dt * 4)
      phase += dt * ctl.speed * (p.hairStyle === 'dog' ? 9 : p.child ? 7 : 6) * Math.max(0.12, amt)
      spin += dt * ctl.speed * 0.7
      const dir = (Math.floor(spin) % 8) as Dir
      if (dir !== lastDir) { lastDir = dir; setDirLabel(DIR_NAMES[dir] + (dir > 4 ? ' (spejlet)' : '')) }
      const pose = poseFor(p, phase, amt)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#a6713f'; ctx.fillRect(0, c.height - 6, c.width, 6)
      drawPerson(ctx, c.width / 2, c.height - 4, p, pose, dir)
      sctx.clearRect(0, 0, s.width, s.height)
      for (let d = 0; d < 8; d++) drawPerson(sctx, 12 + d * 24, s.height - 1, p, pose, d as Dir)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [p])
  return (
    <article className="card person">
      <div className="stage pixel-stage">
        <canvas ref={big} width={48} height={64} className="pixel-canvas" />
        <span className="dir-label">{dirLabel}</span>
      </div>
      <div className="strip"><canvas ref={strip} width={192} height={52} className="pixel-canvas" /></div>
      <h2>{p.name}</h2>
      <p>{p.hairStyle === 'dog' ? 'Familiens hund' : `${p.height.toFixed(2).replace('.', ',')} m${p.age ? ` · ${p.age}` : ''}`} · {Math.round(p.height * PX_PER_M)} px høj</p>
    </article>
  )
}

function App() {
  const [speed, setSpeed] = useState(1)
  const [walking, setWalking] = useState(true)
  ctl.speed = speed
  ctl.walking = walking
  return (
    <main>
      <header>
        <div>
          <h1>Familien i pixelart</h1>
          <p>Stephan, Lisa, Mathilde, Max-Emil og hunden som 2D-pixelsprites i alle 8 retninger (forfra, skråt, side, bagfra — venstre er spejlet). Tegnet procedurelt hver frame ud fra den naturlige gangcyklus og med 1 px kontur. Højderne følger de rigtige mål.</p>
        </div>
        <div className="controls">
          <button className={walking ? 'on' : ''} onClick={() => setWalking(!walking)}>{walking ? 'Går' : 'Står'}</button>
          {[0.5, 1, 2].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
          <a href="/family-voxel.html">Familien i voxel</a>
          <a href="/showcase.html">Alle avatar-stile</a>
          <a href="/">← Huset</a>
        </div>
      </header>
      <section className="card parade-card"><Parade /></section>
      <section className="grid family-grid">{FAMILY.map((p) => <PersonCard key={p.id} p={p} />)}</section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
