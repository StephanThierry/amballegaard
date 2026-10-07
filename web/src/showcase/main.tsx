import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { StrictMode, Suspense, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Biped } from './Biped'
import { controls } from './shared'
import { PixelSprite, SkeletalAvatar, WalkCircle } from './variants'
import './showcase.css'

interface Variant {
  id: string
  title: string
  level: 'Enkel' | 'Mellem' | 'Kompleks'
  text: string
  pros: string
  cons: string
  scene: ReactNode
  pixelated?: boolean
  camera?: [number, number, number]
}

const variants: Variant[] = [
  {
    id: 'current', title: 'Nuværende (reference)', level: 'Mellem',
    text: 'Som i huset i dag: kapsler og kugler, stive ben og arme der svinger som penduler fra hoften og skulderen.',
    pros: 'Billig at tegne, kræver ingen assets.', cons: 'Ingen knæ eller fodafvikling — glider og "sakser" hen over gulvet.',
    scene: <WalkCircle><Biped style="current" gait="pendulum" /></WalkCircle>,
  },
  {
    id: 'lowpoly', title: 'Low-poly med naturlig gang', level: 'Mellem',
    text: 'Samme figur, men med facetteret low-poly-look og en rigtig gangcyklus: knæet bøjer i svinget, foden holdes vandret og ruller af, hoften vipper, skuldrene roterer modsat og albuerne bøjer.',
    pros: 'Passer til isometrisk diorama-stil, læselig på afstand, stadig 100 % kode.', cons: 'Facetter kan stritte mod de bløde PBR-møbler.',
    scene: <WalkCircle><Biped style="lowpoly" gait="natural" /></WalkCircle>,
  },
  {
    id: 'toy', title: 'Legetøj / figur (chibi)', level: 'Mellem',
    text: 'Store hoveder, korte ben, bløde former og store øjne — som Animal Crossing/Playmobil. Hoppende gang med kortere skridt.',
    pros: 'Meget indbydende og "hyggelig", karakteren læses tydeligt ovenfra.', cons: 'Mindre realistisk end huset; proportioner skal skaleres ned for at passe til møblerne.',
    scene: <WalkCircle><Biped style="toy" gait="bouncy" /></WalkCircle>,
  },
  {
    id: 'voxel', title: 'Voxel (blokfigur)', level: 'Enkel',
    text: 'Kasser hele vejen (Crossy Road/Minecraft-agtig). Samme naturlige gang, så selv simple blokke bevæger sig troværdigt.',
    pros: 'Meget tydelig silhuet, ekstremt billig, nem at variere tøj/hår.', cons: 'Stilbrud mod realistiske møbler, medmindre resten også stiliseres.',
    scene: <WalkCircle><Biped style="voxel" gait="natural" /></WalkCircle>,
  },
  {
    id: 'pixel', title: 'Pixelart-sprite (2D)', level: 'Enkel',
    text: '32×48 px sprite tegnet procedurelt hver frame ud fra den samme gangcyklus og vist som billboard med skarpe pixels.',
    pros: 'Charmerende retro-look, ingen 3D-model nødvendig.', cons: 'Kun sideprofil — i isometrisk visning skal der tegnes 4–8 retninger.',
    scene: <PixelSprite />, camera: [0, 1.2, 4.2],
  },
  {
    id: 'pixel3d', title: 'Pixeleret 3D', level: 'Enkel',
    text: 'Low-poly-figuren renderet i lav opløsning og skaleret op uden udglatning. Fuld 3D og alle retninger, men med pixelart-udtryk.',
    pros: 'Pixel-charme uden at tegne sprites; virker fra alle vinkler.', cons: 'Hele scenen skal pixeleres for et ensartet look (eller kun beboerne i et eget lag).',
    scene: <WalkCircle><Biped style="lowpoly" gait="natural" /></WalkCircle>, pixelated: true,
  },
  {
    id: 'xbot', title: 'Rigget figur med skelet (Mixamo-stil)', level: 'Kompleks',
    text: 'Rigtig skeletal animation (motion capture "walk"). Her three.js-eksemplets X Bot, farvet i Stephans farver — til huset ville man lave Stephan i fx Ready Player Me/VRoid og genbruge Mixamo-animationerne.',
    pros: 'Den mest naturlige bevægelse; masser af færdige animationer (sidde, sove, lave mad).', cons: 'Kræver modellering/rigging pr. beboer og større filer.',
    scene: <WalkCircle speed={0.6}><Suspense fallback={null}><SkeletalAvatar url="/assets/avatars/Xbot.glb" clip="walk" tint={{ Joints: '#3b4252', HighLimbs: '#262c38' }} /></Suspense></WalkCircle>,
  },
  {
    id: 'soldier', title: 'Realistisk rigget figur', level: 'Kompleks',
    text: 'Fuldt teksturert, realistisk karakter med motion capture-gang (three.js-eksemplets Soldier). Viser niveauet man når med realistiske, riggede modeller.',
    pros: 'Matcher de realistiske PBR-møbler bedst.', cons: 'Tungest at producere; realisme fremhæver fejl ved fx sidde/gribe-animationer.',
    scene: <WalkCircle speed={0.6}><Suspense fallback={null}><SkeletalAvatar url="/assets/avatars/Soldier.glb" clip="Walk" /></Suspense></WalkCircle>,
  },
]

function Card({ v }: { v: Variant }) {
  return (
    <article className="card">
      <div className="stage">
        <Canvas shadows dpr={v.pixelated ? 0.22 : [1, 2]} className={v.pixelated ? 'pixelated' : ''}
          camera={{ position: v.camera ?? [2.6, 2.4, 3.4], fov: 35 }}>
          <color attach="background" args={['#e9ecef']} />
          <Suspense fallback={null}><Environment files="/assets/hdri/sky.hdr" environmentIntensity={0.6} /></Suspense>
          <hemisphereLight args={['#ffffff', '#8a7f6a', 0.5]} />
          <directionalLight position={[3, 5, 2]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[1.8, 48]} />
            <meshStandardMaterial color="#b88a5a" roughness={0.7} />
          </mesh>
          <ContactShadows position={[0, 0.002, 0]} opacity={0.35} scale={4} blur={2.2} far={1.5} />
          {v.scene}
          <OrbitControls target={[0, 0.8, 0]} enablePan={false} minDistance={2} maxDistance={8} />
        </Canvas>
        <span className={`badge ${v.level.toLowerCase()}`}>{v.level}</span>
      </div>
      <h2>{v.title}</h2>
      <p>{v.text}</p>
      <p className="pc"><b>+</b> {v.pros}</p>
      <p className="pc"><b>−</b> {v.cons}</p>
    </article>
  )
}

function App() {
  const [speed, setSpeed] = useState(1)
  const [walking, setWalking] = useState(true)
  controls.speed = speed
  controls.walking = walking
  return (
    <main>
      <header>
        <div>
          <h1>Avatar-showcase: Stephan</h1>
          <p>Alternative opbygninger af beboerne til Amballegaard — fra enkle pixel- og voxelfigurer til riggede figurer med skeletanimation. Træk i et felt for at dreje kameraet.</p>
        </div>
        <div className="controls">
          <button className={walking ? 'on' : ''} onClick={() => setWalking(!walking)}>{walking ? 'Går' : 'Står'}</button>
          {[0.5, 1, 2].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
          <a href="/family.html">Familien i pixelart</a>
          <a href="/">← Tilbage til huset</a>
        </div>
      </header>
      <section className="grid">{variants.map((v) => <Card key={v.id} v={v} />)}</section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
