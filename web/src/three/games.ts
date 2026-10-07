import * as THREE from 'three'

/**
 * Små procedurale "spil" der tegnes på et canvas og bruges som skærmtekstur.
 * Hvert spil har sin egen canvas-størrelse, så et spil kan strække sig over flere skærme.
 */
export interface ScreenGame {
  texture: THREE.CanvasTexture
  update: (t: number) => void
}

export function createGame(kind: string, screens: number): ScreenGame {
  const canvas = document.createElement('canvas')
  canvas.width = 320 * screens
  canvas.height = 180
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const draw = kind === 'blocks' ? blocksGame(ctx, canvas) : kind === 'obby' ? obbyGame(ctx, canvas) : kind === 'streamberry' ? streamberry(ctx, canvas) : racerGame(ctx, canvas)
  let last = -1
  return {
    texture,
    update: (t) => {
      // ~30 fps er rigeligt til en skærm i baggrunden.
      if (t - last < 1 / 30) return
      last = t
      draw(t)
      texture.needsUpdate = true
    },
  }
}

/** Racerspil i bredformat: himmel, bjerge, vej i perspektiv med striber der suser forbi, og en rød bil. */
function racerGame(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
  const W = c.width, H = c.height, horizon = H * 0.45
  return (t: number) => {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#2b5fd9')
    sky.addColorStop(1, '#f6a65a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, horizon)
    ctx.fillStyle = '#ffd46b'
    ctx.beginPath(); ctx.arc(W * 0.72, horizon - 18, 16, 0, Math.PI * 2); ctx.fill()
    // Bjerge der glider langsomt (parallakse)
    ctx.fillStyle = '#4a3f6b'
    ctx.beginPath(); ctx.moveTo(0, horizon)
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, horizon - 18 - 14 * Math.sin((x + t * 12) * 0.02) - 8 * Math.sin((x + t * 12) * 0.053))
    ctx.lineTo(W, horizon); ctx.fill()
    // Græs
    ctx.fillStyle = '#3f8f3a'
    ctx.fillRect(0, horizon, W, H - horizon)
    // Vej med kurve
    const curve = Math.sin(t * 0.4) * 0.35
    for (let y = horizon; y < H; y += 2) {
      const p = (y - horizon) / (H - horizon)
      const cx = W / 2 + curve * W * (1 - p) * (1 - p) * 0.8
      const half = 8 + p * W * 0.32
      const stripe = Math.floor((1 / (p + 0.05)) * 3 + t * 18) % 2 === 0
      ctx.fillStyle = stripe ? '#d23b3b' : '#f2f2f2'
      ctx.fillRect(cx - half - 6 - p * 10, y, 6 + p * 10, 2)
      ctx.fillRect(cx + half, y, 6 + p * 10, 2)
      ctx.fillStyle = '#55575c'
      ctx.fillRect(cx - half, y, half * 2, 2)
      if (stripe) { ctx.fillStyle = '#f5d442'; ctx.fillRect(cx - 1 - p * 2, y, 2 + p * 4, 2) }
    }
    // Bil
    const carX = W / 2 + Math.sin(t * 1.3) * W * 0.08
    const carY = H - 34
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(carX - 26, carY + 22, 52, 6)
    ctx.fillStyle = '#d4202c'; ctx.fillRect(carX - 24, carY + 6, 48, 18)
    ctx.fillStyle = '#a3141e'; ctx.fillRect(carX - 16, carY - 4, 32, 12)
    ctx.fillStyle = '#9fd3ff'; ctx.fillRect(carX - 12, carY - 2, 24, 7)
    ctx.fillStyle = '#111'; ctx.fillRect(carX - 26, carY + 16, 8, 10); ctx.fillRect(carX + 18, carY + 16, 8, 10)
    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(8, 8, 120, 22)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'
    ctx.fillText(`${(180 + Math.round(Math.sin(t * 0.7) * 40)).toString().padStart(3, ' ')} km/t`, 14, 24)
    ctx.fillText(`LAP 2/3  ${Math.floor(t % 60).toString().padStart(2, '0')}.${Math.floor((t % 1) * 10)}`, W - 160, 24)
  }
}

/** Faldende-klodser-spil: bane i midten, klodser der falder og lander, score i siden. */
function blocksGame(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
  const W = c.width, H = c.height
  const cols = 10, rows = 18, cell = Math.floor((H - 10) / rows)
  const ox = Math.floor((W - cols * cell) / 2), oy = 5
  const colors = ['#00d2ff', '#ffd400', '#b04dff', '#2ee86b', '#ff4b4b', '#3f6bff', '#ff9a2e']
  const shapes = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]],
    [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[2, 0], [0, 1], [1, 1], [2, 1]]]
  const grid: (string | null)[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, cI) => (r > rows - 5 && (r * 7 + cI * 3) % 5 !== 0 ? colors[(r + cI) % colors.length] : null)))
  let piece = { s: 0, x: 3, y: 0 }
  let next = 1, score = 1200, lastStep = 0
  const fits = (s: number, x: number, y: number) =>
    shapes[s].every(([dx, dy]) => y + dy < rows && x + dx >= 0 && x + dx < cols && !grid[y + dy]?.[x + dx])
  return (t: number) => {
    if (t - lastStep > 0.25) {
      lastStep = t
      // Lidt "kunstig intelligens": glid mod en kolonne der skifter over tid.
      const target = Math.floor((Math.sin(piece.s * 2.1 + t * 0.05) * 0.5 + 0.5) * (cols - 3))
      if (piece.x < target && fits(piece.s, piece.x + 1, piece.y)) piece.x++
      else if (piece.x > target && fits(piece.s, piece.x - 1, piece.y)) piece.x--
      if (fits(piece.s, piece.x, piece.y + 1)) piece.y++
      else {
        shapes[piece.s].forEach(([dx, dy]) => { if (grid[piece.y + dy]) grid[piece.y + dy][piece.x + dx] = colors[piece.s] })
        for (let r = rows - 1; r >= 0; r--) if (grid[r].every(Boolean)) { grid.splice(r, 1); grid.unshift(Array(cols).fill(null)); score += 100 }
        if (grid[3].some(Boolean)) grid.forEach((row, r) => { if (r < rows - 4) row.fill(null) })
        piece = { s: next, x: 3, y: 0 }
        next = (next + 3) % shapes.length
        score += 10
      }
    }
    ctx.fillStyle = '#0b0f24'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#141a3a'; ctx.fillRect(ox - 3, oy - 3, cols * cell + 6, rows * cell + 6)
    const block = (x: number, y: number, col: string) => {
      ctx.fillStyle = col; ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, 2)
    }
    grid.forEach((row, r) => row.forEach((col, cI) => { if (col) block(cI, r, col) }))
    shapes[piece.s].forEach(([dx, dy]) => block(piece.x + dx, piece.y + dy, colors[piece.s]))
    ctx.fillStyle = '#e8ecff'; ctx.font = 'bold 13px monospace'
    ctx.fillText('SCORE', 10, 24); ctx.fillText(String(score).padStart(6, '0'), 10, 42)
    ctx.fillText('NEXT', W - 62, 24)
    shapes[next].forEach(([dx, dy]) => { ctx.fillStyle = colors[next]; ctx.fillRect(W - 62 + dx * 9, 34 + dy * 9, 8, 8) })
  }
}

/**
 * Blok-platformspil i Roblox-stil: klodsede figurer (gult firkantet hoved, farvet krop), grøn baseplate med knopper,
 * farvede 'obby'-platforme der glider forbi, en figur der hopper mellem dem, og chat/leaderboard i hjørnerne.
 */
function obbyGame(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
  const W = c.width, H = c.height
  const colors = ['#e8463c', '#2f7cf6', '#f5c518', '#3fbf5a', '#a259e6', '#ff8a1f']
  const avatar = (x: number, y: number, s: number, shirt: string, pants: string, legPhase: number) => {
    const sw = Math.sin(legPhase) * s * 0.18
    ctx.fillStyle = pants
    ctx.fillRect(x - s * 0.22 + sw, y - s * 0.55, s * 0.2, s * 0.55)
    ctx.fillRect(x + 0.02 * s - sw, y - s * 0.55, s * 0.2, s * 0.55)
    ctx.fillStyle = shirt
    ctx.fillRect(x - s * 0.25, y - s * 1.1, s * 0.5, s * 0.55)
    ctx.fillStyle = '#f7d046'
    ctx.fillRect(x - s * 0.42, y - s * 1.08, s * 0.16, s * 0.5)
    ctx.fillRect(x + s * 0.26, y - s * 1.08, s * 0.16, s * 0.5)
    ctx.fillRect(x - s * 0.17, y - s * 1.45, s * 0.34, s * 0.34)
    ctx.fillStyle = '#222'
    ctx.fillRect(x - s * 0.1, y - s * 1.35, s * 0.05, s * 0.06)
    ctx.fillRect(x + s * 0.05, y - s * 1.35, s * 0.05, s * 0.06)
    ctx.fillRect(x - s * 0.08, y - s * 1.24, s * 0.16, s * 0.025)
  }
  const block = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 4, w, 4)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, w, 3)
  }
  return (t: number) => {
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#5aa9f0'); sky.addColorStop(1, '#bfe3ff')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
    // Skyer som blokke
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 97 - t * 8) % (W + 80) + W + 80) % (W + 80) - 40
      ctx.fillRect(cx, 18 + i * 9, 46, 12); ctx.fillRect(cx + 10, 10 + i * 9, 24, 10)
    }
    // Baseplate med knopper
    const groundY = H - 34
    ctx.fillStyle = '#4cae4f'; ctx.fillRect(0, groundY, W, H - groundY)
    ctx.fillStyle = '#5fc262'
    const off = (t * 40) % 14
    for (let x = -off; x < W; x += 14) for (let y = groundY + 5; y < H; y += 10) ctx.fillRect(x, y, 6, 3)
    // Obby-platforme der scroller forbi
    const speed = 40, spacing = 62
    const scroll = t * speed
    const plat = (i: number) => ({ x: i * spacing - scroll + 40, y: groundY - 30 - ((i * 37) % 3) * 20, col: colors[i % colors.length] })
    const first = Math.floor((scroll - 40) / spacing) - 1
    for (let i = first; i < first + 8; i++) {
      const p = plat(i)
      block(p.x, p.y, 44, 12, p.col)
      if (i % 4 === 3) { ctx.fillStyle = '#ff2a2a'; ctx.fillRect(p.x + 8, p.y - 4, 28, 4) } // lava-stribe
    }
    // Hoppende spiller: parabel mellem platformene
    const s = (scroll - 40 + 160) / spacing
    const i0 = Math.floor(s), k = s - i0
    const a = plat(i0), b = plat(i0 + 1)
    const px = 160 + 22
    const py = a.y + (b.y - a.y) * k - Math.sin(Math.PI * k) * 34
    avatar(px, py, 30, '#2f7cf6', '#1d2a4d', t * 10)
    // Andre spillere på baseplate
    avatar(40 + Math.sin(t) * 10, groundY, 24, '#e8463c', '#333', t * 6)
    avatar(W - 50, groundY, 24, '#3fbf5a', '#5a3b1d', t * 4 + 1)
    // UI: leaderboard + chat
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(W - 96, 6, 90, 44)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('Stage', W - 40, 17)
    ctx.font = '10px sans-serif'
    ctx.fillText('Mathilde', W - 90, 30); ctx.fillText(String(12 + Math.floor(t / 6) % 30), W - 30, 30)
    ctx.fillText('Guest_42', W - 90, 43); ctx.fillText(String(9 + Math.floor(t / 9) % 20), W - 30, 43)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(6, 6, 118, 30)
    ctx.fillStyle = '#fff'
    ctx.fillText('Guest_42: hej!! :)', 10, 18)
    ctx.fillText(Math.floor(t / 5) % 2 ? 'Mathilde: kom med!' : 'Mathilde: lol', 10, 31)
  }
}

/**
 * "Streamberry" (streamingtjenesten fra Black Mirror) der afspiller "Joan Is Awful": en kontorscene med Joan ved
 * skrivebordet, kollega der går forbi, undertekster, og afspillerens UI (logo, titel, progressbar) der toner ind og ud.
 */
function streamberry(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) {
  const W = c.width, H = c.height
  const subs = [
    'JOAN: Jeg har bare en helt normal dag.',
    'JOAN: ...hvorfor føles det som om nogen ser med?',
    'KOLLEGA: Joan, mødet starter nu.',
    'JOAN: Det er bare en serie. Det er bare en serie.',
  ]
  const person = (x: number, y: number, s: number, hair: string, top: string, bob: number) => {
    ctx.fillStyle = top
    ctx.fillRect(x - 10 * s, y - 28 * s + bob, 20 * s, 26 * s)
    ctx.fillStyle = '#e9c3a6'
    ctx.beginPath(); ctx.arc(x, y - 36 * s + bob, 8 * s, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = hair
    ctx.beginPath(); ctx.arc(x, y - 39 * s + bob, 8.5 * s, Math.PI, 0); ctx.fill()
    ctx.fillRect(x - 8.5 * s, y - 39 * s + bob, 3 * s, 12 * s)
    ctx.fillRect(x + 5.5 * s, y - 39 * s + bob, 3 * s, 12 * s)
  }
  return (t: number) => {
    // Kontor: væg, vindue med by, gulv
    ctx.fillStyle = '#c9c2b4'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#8fb3cf'; ctx.fillRect(W * 0.58, 18, W * 0.34, 70)
    ctx.fillStyle = '#6f8fab'
    for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.6 + i * 18, 88 - 20 - (i * 13) % 35, 14, 20 + (i * 13) % 35)
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 3; ctx.strokeRect(W * 0.58, 18, W * 0.34, 70)
    ctx.fillStyle = '#7b6a58'; ctx.fillRect(0, H * 0.72, W, H * 0.28)
    // Skrivebord + skærm
    ctx.fillStyle = '#5a4634'; ctx.fillRect(W * 0.12, H * 0.62, W * 0.4, 8)
    ctx.fillStyle = '#222'; ctx.fillRect(W * 0.32, H * 0.45, 40, 26)
    ctx.fillStyle = '#9ad'; ctx.fillRect(W * 0.32 + 3, H * 0.45 + 3, 34, 20)
    // Joan (let kameraskub / zoom)
    const zoom = 1 + 0.04 * Math.sin(t * 0.25)
    person(W * 0.24, H * 0.66, 1.25 * zoom, '#3b2618', '#2f5f8f', Math.sin(t * 2) * 0.6)
    // Kollega der går forbi
    const kx = ((t * 26) % (W + 80)) - 40
    person(kx, H * 0.78, 1.4, '#c9a46a', '#7a3b3b', Math.abs(Math.sin(t * 6)) * -2)
    // Letterbox
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10)
    // Undertekst
    const sub = subs[Math.floor(t / 4) % subs.length]
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'
    const tw = ctx.measureText(sub).width
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - tw / 2 - 4, H - 30, tw + 8, 13)
    ctx.fillStyle = '#fff'; ctx.fillText(sub, W / 2, H - 20)
    ctx.textAlign = 'left'
    // Afspiller-UI der toner ind hvert 12. sekund
    const ui = Math.max(0, Math.sin(((t % 12) / 12) * Math.PI) * 2 - 1)
    if (ui > 0) {
      ctx.globalAlpha = ui
      const grad = ctx.createLinearGradient(0, 0, 0, 50)
      grad.addColorStop(0, 'rgba(0,0,0,0.8)'); grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 50)
      ctx.fillStyle = '#e50914'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('STREAMBERRY', 8, 22)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('Joan Is Awful', 8, 38)
      ctx.font = '9px sans-serif'; ctx.fillStyle = '#ccc'; ctx.fillText('S1:E1 · "Joan Is Awful"', 88, 38)
      const prog = (t % 600) / 600
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(8, H - 14, W - 16, 3)
      ctx.fillStyle = '#e50914'; ctx.fillRect(8, H - 14, (W - 16) * prog, 3)
      ctx.beginPath(); ctx.arc(8 + (W - 16) * prog, H - 12.5, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    }
  }
}
