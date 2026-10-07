import { gaitPose, type Pose } from './gait'

/** Beskrivelse af en pixel-person. Højde i meter styrer sprite-højden (≈26 px pr. meter). */
export interface PixelPerson {
  id: string
  name: string
  height: number
  age?: string
  skin: string
  hair: string
  hairStyle: 'short' | 'long' | 'messy' | 'ponytail' | 'dog'
  top: string
  bottom: string
  shoes: string
  goatee?: string
  child?: boolean
  pattern?: 'plaid'
  feminine?: boolean
}

export const FAMILY: PixelPerson[] = [
  { id: 'stephan', name: 'Stephan', height: 1.68, skin: '#f1c7a8', hair: '#9a7348', hairStyle: 'short', top: '#262c38', bottom: '#3b4252', shoes: '#18191c', goatee: '#a57a4f' },
  { id: 'lisa', name: 'Lisa', height: 1.68, skin: '#f3cfb6', hair: '#d8b77a', hairStyle: 'long', top: '#b3262e', bottom: '#3d5f8f', shoes: '#6b4a32', pattern: 'plaid', feminine: true },
  { id: 'mathilde', name: 'Mathilde', height: 1.35, age: '12 år', skin: '#f6d6c2', hair: '#b4441f', hairStyle: 'ponytail', top: '#e2a33b', bottom: '#43506a', shoes: '#f0f0f0', child: true },
  { id: 'maxemil', name: 'Max-Emil', height: 1.25, age: '13 år', skin: '#f3d0b8', hair: '#c49a5c', hairStyle: 'messy', top: '#3f7cc4', bottom: '#2f3a4f', shoes: '#22252b', child: true },
  { id: 'hund', name: 'Hund', height: 0.55, skin: '#c9a26b', hair: '#a87d47', hairStyle: 'dog', top: '#c9a26b', bottom: '#c9a26b', shoes: '#2a2018' },
]

export const PX_PER_M = 26

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`
}

/**
 * 8 retninger: 0 forfra, 1 skråt forfra (mod højre), 2 højre, 3 skråt bagfra (mod højre), 4 bagfra,
 * 5 skråt bagfra (venstre), 6 venstre, 7 skråt forfra (venstre). Venstre-retningerne er spejlinger.
 */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
export const DIR_NAMES = ['Forfra', 'Skråt forfra', 'Side', 'Skråt bagfra', 'Bagfra', 'Skråt bagfra', 'Side', 'Skråt forfra']

/** Retning ud fra bevægelse på skærmen (dx mod højre, dy mod beskueren/nedad). */
export function dirFromMove(dx: number, dy: number): Dir {
  const a = Math.atan2(dx, dy) // 0 = mod beskueren
  return (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8) as Dir
}

type View = 'front' | 'frontQ' | 'side' | 'backQ' | 'back'
const VIEWS: [View, boolean][] = [['front', false], ['frontQ', false], ['side', false], ['backQ', false], ['back', false], ['backQ', true], ['side', true], ['frontQ', true]]

export function drawPerson(target: CanvasRenderingContext2D, gx: number, gy: number, p: PixelPerson, pose: Pose, dir: Dir = 2) {
  const W = 40, H = 64
  const buf = getBuffer(W, H)
  const ctx = buf.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  const ox = 20, oy = H - 2
  const [view, mirror] = VIEWS[dir]
  if (p.hairStyle === 'dog') {
    if (view === 'side' || view === 'frontQ' || view === 'backQ') drawDog(ctx, ox, oy, p, pose)
    else drawDogFrontal(ctx, ox, oy, p, pose, view === 'back')
  } else if (view === 'side') drawHuman(ctx, ox, oy, p, pose)
  else drawHumanFrontal(ctx, ox, oy, p, pose, view)
  outline(ctx, W, H, '#1a1714')
  target.save()
  target.imageSmoothingEnabled = false
  if (mirror) { target.translate(gx, 0); target.scale(-1, 1); target.drawImage(buf, -ox, gy - oy) }
  else target.drawImage(buf, gx - ox, gy - oy)
  target.restore()
}

/** Forfra/bagfra (og skråt, hvor alt forskydes 1 px mod gangretningen). Benene "løftes" i svingfasen, armene forkortes når de svinger. */
function drawHumanFrontal(ctx: CanvasRenderingContext2D, ox: number, oy: number, p: PixelPerson, pose: Pose, view: View) {
  const back = view === 'back' || view === 'backQ'
  const q = view === 'frontQ' || view === 'backQ' ? 1 : 0
  const Hpx = Math.round(p.height * PX_PER_M)
  const legs = Math.round(Hpx * (p.child ? 0.44 : 0.47))
  const torso = Math.round(Hpx * (p.child ? 0.29 : 0.3))
  const head = Hpx - legs - torso
  const bob = Math.round(pose.bob * 40)
  const sway = Math.round(pose.hipRoll * 12)
  const px = (x: number, y: number, w: number, h: number, c: string) => { if (w > 0 && h > 0) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) } }
  const hipY = oy - legs + bob
  const shoulderY = hipY - torso + 2
  const bodyW = (p.child ? 6 : p.feminine ? 6 : 7) - q
  const bx = ox - Math.floor(bodyW / 2) + sway
  const dark = { top: shade(p.top, 0.72), bottom: shade(p.bottom, 0.8), skin: shade(p.skin, 0.85), hair: shade(p.hair, 0.8) }

  // Langt hår bag skuldrene (forfra) / hestehale bagfra tegnes efter kroppen
  if (p.hairStyle === 'long' && !back) px(bx - 1 + q, shoulderY - 2, bodyW + 2 - q, 5, dark.hair)

  // Ben: to søjler; benet i svingfasen løftes (knæet bøjer), det forreste står 1 px lavere (tættere på).
  const legW = p.feminine || p.child ? 2 : 3
  for (const i of [0, 1]) {
    const L = pose.legs[i]
    const lift = Math.round(Math.max(0, L.knee - 0.15) * legs * 0.16)
    const near = (back ? L.hip > 0.15 : L.hip < -0.15) ? 1 : 0
    const lx = i === 0 ? bx + (p.child ? 0 : 1) : bx + bodyW - legW - (p.child ? 0 : 1)
    const footY = oy - lift + near
    const c = q && i === 0 ? dark.bottom : p.bottom
    px(lx + q * (i === 0 ? 1 : 0), hipY + 1, legW, footY - hipY - 3, c)
    px(lx - (back ? 0 : 0) + q, footY - 2, legW + (back ? 0 : 1) - (i === 0 && q ? 1 : 0), 2, i === 0 && q ? shade(p.shoes, 0.7) : p.shoes)
  }
  // Krop
  px(bx, shoulderY, bodyW, torso - 1, p.top)
  if (p.pattern === 'plaid') plaid(ctx, bx, shoulderY, bodyW, torso - 1)
  px(bx, shoulderY, bodyW, 1, shade(p.top, 1.2))
  if (p.feminine) { px(bx + 1, shoulderY + Math.round(torso * 0.5), bodyW - 2, 1, shade(p.top, 0.75)); px(bx - 1, hipY - 2, bodyW + 2, 3, p.bottom) } // talje + hofter
  else px(bx, hipY - 2, bodyW, 3, p.bottom)
  if (!back) px(bx + Math.floor(bodyW / 2) - 1 + q, shoulderY, 2, 1, p.skin) // halsudskæring
  // Arme: forkortes når de svinger frem/tilbage, hånd i bunden.
  const armLen = Math.round(torso * 0.95)
  for (const i of [0, 1]) {
    const A = pose.arms[i]
    const len = armLen - Math.round(Math.abs(A.shoulder) * 4)
    const ax = i === 0 ? bx - 2 + q : bx + bodyW
    const hidden = q && i === 0
    px(ax, shoulderY + 1, 2, len - 2, hidden ? dark.top : p.top)
    px(ax, shoulderY + len - 1, 2, 2, hidden ? dark.skin : p.skin)
  }
  // Hoved
  const hw = (p.child ? head : head - 1) - q
  const hx = ox - Math.floor(hw / 2) + q + sway
  const neck = p.child ? 1 : 2
  const hy = shoulderY - head + 1 - neck
  px(ox - 1 + q + sway, shoulderY - 1 - neck, 3, 2 + neck, back ? dark.skin : p.skin)
  px(hx, hy, hw, head - 1, p.skin)
  const hair = p.hair, hairD = dark.hair
  if (!back) {
    // Ører, øjne, mund
    px(hx - 1, hy + Math.round(head * 0.45), 1, 2, dark.skin)
    if (!q) px(hx + hw, hy + Math.round(head * 0.45), 1, 2, dark.skin)
    const ey = hy + Math.round(head * 0.42)
    px(hx + Math.round(hw * 0.28) + q, ey, 1, 2, '#141518')
    px(hx + hw - 1 - Math.round(hw * 0.28) + q, ey, 1, 2, '#141518')
    if (pose.surprised) px(hx + Math.floor(hw / 2) - 1 + q, hy + Math.round(head * 0.66), 2, 2, '#3a1c1c') // åben mund
    else px(hx + Math.floor(hw / 2) - 1 + q, hy + Math.round(head * 0.72), 2, 1, shade(p.skin, 0.78))
    if (q) px(hx + hw, hy + Math.round(head * 0.5), 1, 2, p.skin) // næsetip i profilkanten
    if (p.goatee) {
      px(hx + Math.floor(hw / 2) - 1 + q, hy + head - 3, 2, 2, p.goatee)
      px(hx + Math.floor(hw / 2) - 1 + q, hy + head - 1, 2, 1, p.goatee)
    }
  }
  switch (p.hairStyle) {
    case 'short':
    case 'messy': {
      const extra = p.hairStyle === 'messy' ? 1 : 0
      px(hx - 1 - extra, hy - 1, hw + 2 + extra * 2, 3, hair)
      for (let i = -extra; i < hw + extra; i += 2) px(hx + i, hy - 2, 1, 1, (i & 2) ? hair : hairD)
      if (back) px(hx - 1, hy, hw + 2, head - 3, hair)
      else {
        px(hx - 1, hy + 1, 1, 3, hair); px(hx + hw, hy + 1, 1, 3, hair) // bakkenbarter
        if (extra) for (let i = 0; i < hw; i += 3) px(hx + i, hy + 2, 2, 1, hair) // pandehår
      }
      break
    }
    case 'long':
      px(hx - 1, hy - 1, hw + 2, 3, hair)
      if (back) { px(hx - 1, hy, hw + 2, head + 1, hair); px(hx, hy + head + 1, hw, 3, hairD) }
      else { px(hx - 2, hy, 2, head + 4, hair); px(hx + hw, hy, 2, head + 4, hair); px(hx + 1, hy + 2, hw - 3, 1, hair) }
      break
    case 'ponytail':
      px(hx - 1, hy - 1, hw + 2, 3, hair)
      if (back) {
        px(hx - 1, hy, hw + 2, head - 2, hair)
        px(hx + Math.floor(hw / 2) - 1, hy + 1, 2, 1, '#2f6db0') // hårelastik
        px(hx + Math.floor(hw / 2) - 1, hy + 2, 3, head + 3, hairD)
      } else {
        px(hx - 1, hy + 1, 1, 3, hair); px(hx + hw, hy + 1, 1, 3, hair)
        px(hx + hw + (q ? -1 : 1), hy - 2, 2, 3, hairD) // hestehalen kigger frem bag hovedet
      }
      break
  }
}

function drawDogFrontal(ctx: CanvasRenderingContext2D, ox: number, oy: number, p: PixelPerson, pose: Pose, back: boolean) {
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
  const bob = Math.round(pose.bob * 30)
  const by = oy - 9 + bob
  const dark = shade(p.skin, 0.78)
  for (const i of [0, 1]) {
    const lift = Math.round(Math.max(0, pose.legs[i].knee - 0.15) * 3)
    px(ox - 4 + i * 6, by + 3, 2, 6 - lift, i ? p.skin : dark)
  }
  px(ox - 4, by - 2, 8, 6, p.skin)
  if (back) {
    const wag = Math.round(Math.sin(pose.torsoYaw * 40) * 2)
    px(ox - 1 + wag, by - 6, 2, 4, p.skin)
    px(ox - 3, by + 1, 6, 2, dark)
  } else {
    px(ox - 3, by - 8, 6, 6, p.skin)
    px(ox - 5, by - 8, 2, 5, p.hair); px(ox + 3, by - 8, 2, 5, p.hair)
    px(ox - 2, by - 6, 1, 1, '#1a1410'); px(ox + 1, by - 6, 1, 1, '#1a1410')
    px(ox - 1, by - 4, 2, 2, shade(p.skin, 1.1)); px(ox - 1, by - 4, 2, 1, '#1a1410')
  }
}

const buffers = new Map<string, HTMLCanvasElement>()
function getBuffer(w: number, h: number) {
  const k = `${w}x${h}`
  let c = buffers.get(k)
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; buffers.set(k, c) }
  return c
}

function drawHuman(ctx: CanvasRenderingContext2D, ox: number, oy: number, p: PixelPerson, pose: Pose) {
  const Hpx = Math.round(p.height * PX_PER_M)
  const legs = Math.round(Hpx * (p.child ? 0.44 : 0.47))
  const torso = Math.round(Hpx * (p.child ? 0.29 : 0.3))
  const head = Hpx - legs - torso
  const bob = Math.round(pose.bob * 40)
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
  // Lem som kæde af pixels; vinkel fra lodret (positiv = bagud = mod venstre).
  const limb = (x: number, y: number, a1: number, l1: number, a2: number, l2: number, w: number, c1: string, c2: string, foot?: string, footA = 0) => {
    let cx = x, cy = y
    for (let i = 0; i < l1; i++) { px(cx - w / 2, cy, w, 1, c1); cx -= Math.sin(a1); cy += Math.cos(a1) }
    for (let i = 0; i < l2; i++) { px(cx - w / 2, cy, w, 1, c2); cx -= Math.sin(a1 + a2); cy += Math.cos(a1 + a2) }
    if (foot) { px(cx - 1, cy - 1, 4, 2, foot); if (footA < -0.15) px(cx + 2, cy - 2, 1, 1, foot) }
  }
  const hipY = oy - legs + bob
  const shoulderY = hipY - torso + 2
  const thigh = Math.round(legs * 0.48), shin = legs - thigh - 1
  const upper = Math.round(torso * 0.5), fore = Math.round(torso * 0.45)
  const back = { top: shade(p.top, 0.72), bottom: shade(p.bottom, 0.72), skin: shade(p.skin, 0.85), shoes: shade(p.shoes, 0.7) }
  const bodyW = p.child ? 6 : p.feminine ? 5 : 7
  const bx = ox - Math.floor(bodyW / 2)

  // Langt hår bag kroppen
  if (p.hairStyle === 'long') px(bx - 1, shoulderY - head + 2, 5, head + 4, shade(p.hair, 0.85))
  // Bagerste ben og arm
  limb(ox, hipY, pose.legs[1].hip, thigh, pose.legs[1].knee, shin, 3, back.bottom, back.bottom, back.shoes, pose.legs[1].ankle)
  limb(ox + 1, shoulderY + 1, pose.arms[1].shoulder, upper, pose.arms[1].elbow, fore, 2, back.top, back.skin)
  // Krop
  px(bx, shoulderY, bodyW, torso - 1, p.top)
  if (p.pattern === 'plaid') plaid(ctx, bx, shoulderY, bodyW, torso - 1)
  px(bx, shoulderY, bodyW, 1, shade(p.top, 1.25))
  if (p.feminine) { px(bx + bodyW, shoulderY + 3, 1, 3, p.top); px(bx - 1, hipY - 2, bodyW + 2, 3, p.bottom) } // buste + hofte
  else px(bx, hipY - 2, bodyW, 3, p.bottom)
  // Forreste ben
  limb(ox, hipY, pose.legs[0].hip, thigh, pose.legs[0].knee, shin, 3, p.bottom, p.bottom, p.shoes, pose.legs[0].ankle)
  // Hals + hoved
  const hw = p.child ? head : head - 1
  const neck = p.child ? 1 : 2
  const hx = ox - hw / 2 + 1, hy = shoulderY - head + 1 - neck
  px(ox - 1, shoulderY - 1 - neck, 3, 2 + neck, p.skin)
  px(hx, hy, hw, head - 1, p.skin)
  px(hx + hw - 1, hy + Math.round(head * 0.5), 1, 2, p.skin) // næse
  px(hx + hw - 3, hy + Math.round(head * 0.38), 1, 2, '#141518') // øje
  if (pose.surprised) px(hx + hw - 2, hy + Math.round(head * 0.68), 1, 2, '#3a1c1c') // åben mund
  px(hx + 2, hy + Math.round(head * 0.45), 1, 2, shade(p.skin, 0.88)) // øre
  // Hår
  const hair = p.hair, hairD = shade(p.hair, 0.8)
  switch (p.hairStyle) {
    case 'short':
      px(hx - 1, hy - 1, hw + 1, 3, hair)
      px(hx - 1, hy + 1, 3, 3, hair)
      for (let i = 0; i < hw; i += 2) px(hx + i, hy - 2, 1, 1, hairD) // pjuskede spidser
      break
    case 'messy':
      px(hx - 1, hy - 1, hw + 2, 3, hair)
      px(hx - 1, hy + 1, 3, 4, hair)
      px(hx + hw - 2, hy + 2, 2, 1, hair)
      for (let i = -1; i < hw + 1; i += 2) px(hx + i, hy - 2, 1, 1, i % 4 === 1 ? hair : hairD)
      break
    case 'long':
      px(hx - 1, hy - 1, hw + 1, 3, hair)
      px(hx - 1, hy + 1, 3, head + 2, hair)
      px(hx + hw - 2, hy + 1, 1, 2, hair)
      break
    case 'ponytail':
      px(hx - 1, hy - 1, hw + 1, 3, hair)
      px(hx - 1, hy + 1, 2, 3, hair)
      px(hx - 3, hy + 1, 2, 2, hairD)
      px(hx - 4, hy + 3, 2, 5, hair)
      px(hx - 3, hy + 8, 1, 1, hair)
      break
  }
  // Hageskæg (kun på hagen + lille overskæg-skygge)
  if (p.goatee) {
    px(hx + hw - 4, hy + head - 3, 3, 2, p.goatee)
    px(hx + hw - 3, hy + head - 1, 2, 1, p.goatee)
  }
  // Forreste arm (over kroppen)
  limb(ox + 1, shoulderY + 1, pose.arms[0].shoulder, upper, pose.arms[0].elbow, fore, 2, p.top, p.skin)
}

function drawDog(ctx: CanvasRenderingContext2D, ox: number, oy: number, p: PixelPerson, pose: Pose) {
  const px = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h) }
  const bob = Math.round(pose.bob * 30)
  const by = oy - 9 + bob
  const leg = (x: number, a: number, c: string) => {
    let cx = x, cy = by + 3
    for (let i = 0; i < 6; i++) { px(cx, cy, 2, 1, c); cx -= Math.sin(a) * 0.9; cy += 1 }
  }
  const dark = shade(p.skin, 0.75)
  leg(ox - 5, pose.legs[1].hip * 1.2, dark); leg(ox + 4, pose.legs[0].hip * 1.2, dark)
  px(ox - 7, by - 2, 14, 6, p.skin) // krop
  px(ox - 7, by + 2, 14, 2, shade(p.skin, 0.9))
  leg(ox - 6, pose.legs[0].hip * 1.2, p.skin); leg(ox + 5, pose.legs[1].hip * 1.2, p.skin)
  px(ox + 5, by - 7, 6, 6, p.skin) // hoved
  px(ox + 10, by - 4, 3, 3, shade(p.skin, 1.08)) // snude
  px(ox + 12, by - 4, 1, 1, '#1a1410') // næse
  px(ox + 8, by - 6, 1, 1, '#1a1410') // øje
  px(ox + 5, by - 6, 2, 5, p.hair) // øre
  const wag = Math.round(Math.sin(pose.torsoYaw * 40) * 1.5)
  px(ox - 9, by - 4 + wag, 2, 1, p.skin); px(ox - 10, by - 5 + wag, 1, 2, p.skin) // hale
}

function outline(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0
  const mark: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) mark.push(x, y)
  }
  const n = parseInt(color.slice(1), 16)
  for (let i = 0; i < mark.length; i += 2) {
    const k = (mark[i + 1] * w + mark[i]) * 4
    d[k] = (n >> 16) & 255; d[k + 1] = (n >> 8) & 255; d[k + 2] = n & 255; d[k + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

/** Pose for en person ved en given fase (hunden traver hurtigere med "bouncy"). */
export function poseFor(p: PixelPerson, phase: number, amount: number) {
  return gaitPose(phase, p.hairStyle === 'dog' ? 'bouncy' : p.child ? 'bouncy' : 'natural', amount)
}

/** Rød/sort tern (2×2 px) lagt oven på en allerede tegnet overdel. */
function plaid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(18,16,16,0.6)'
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if ((Math.floor(i / 2) + Math.floor(j / 2)) % 2) ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1)
  }
}
