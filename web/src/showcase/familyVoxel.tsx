import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { StrictMode, Suspense, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Biped } from './Biped'
import { FAMILY_LOOKS, controls, type Look } from './shared'
import { WalkCircle } from './variants'
import { VoxelDog } from './VoxelDog'
import './showcase.css'

function Stage({ children, camera = [2.4, 2.2, 3.2], floor = 1.6 }: { children: ReactNode; camera?: [number, number, number]; floor?: number }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: camera, fov: 35 }}>
      <color attach="background" args={['#e9ecef']} />
      <Suspense fallback={null}><Environment files="/assets/hdri/sky.hdr" environmentIntensity={0.6} /></Suspense>
      <hemisphereLight args={['#ffffff', '#8a7f6a', 0.5]} />
      <directionalLight position={[3, 5, 2]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[floor, 48]} />
        <meshStandardMaterial color="#b88a5a" roughness={0.7} />
      </mesh>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.35} scale={floor * 2.4} blur={2.2} far={1.5} />
      {children}
      <OrbitControls target={[0, 0.6, 0]} enablePan={false} minDistance={1.5} maxDistance={12} />
    </Canvas>
  )
}

const gaitFor = (l: Look): 'bouncy' | 'natural' => (l.child ? 'bouncy' : 'natural')

function App() {
  const [speed, setSpeed] = useState(1)
  const [walking, setWalking] = useState(true)
  controls.speed = speed
  controls.walking = walking
  return (
    <main>
      <header>
        <div>
          <h1>Familien i voxel</h1>
          <p>Stephan, Lisa, Mathilde, Max-Emil og hunden som blokfigurer med naturlig gang (knæ, fodafvikling, hofte, albuer). Børnene går lidt mere hoppende, hunden traver. Højderne følger de rigtige mål. Træk i felterne for at dreje.</p>
        </div>
        <div className="controls">
          <button className={walking ? 'on' : ''} onClick={() => setWalking(!walking)}>{walking ? 'Går' : 'Står'}</button>
          {[0.5, 1, 2].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
          <a href="/family.html">Familien i pixelart</a>
          <a href="/showcase.html">Alle avatar-stile</a>
          <a href="/">← Huset</a>
        </div>
      </header>
      <section className="card parade-card voxel-parade">
        <Stage camera={[4.2, 3.6, 5.6]} floor={3}>
          {FAMILY_LOOKS.map((l, i) => (
            <WalkCircle key={l.name} r={2} speed={0.5} offset={(i / 5) * Math.PI * 2}><Biped style="voxel" gait={gaitFor(l)} look={l} /></WalkCircle>
          ))}
          <WalkCircle r={2} speed={0.5} offset={(4 / 5) * Math.PI * 2}><VoxelDog walk={walking} speedScale={speed} /></WalkCircle>
        </Stage>
      </section>
      <section className="grid family-grid">
        {FAMILY_LOOKS.map((l) => (
          <article key={l.name} className="card">
            <div className="stage"><Stage><WalkCircle r={0.8}><Biped style="voxel" gait={gaitFor(l)} look={l} /></WalkCircle></Stage></div>
            <h2>{l.name}</h2>
            <p>{l.height.toFixed(2).replace('.', ',')} m{l.child ? ' · barn' : ''}</p>
          </article>
        ))}
        <article className="card">
          <div className="stage"><Stage camera={[1.4, 1.2, 1.9]}><WalkCircle r={0.6}><VoxelDog walk={walking} speedScale={speed} /></WalkCircle></Stage></div>
          <h2>Hund</h2>
          <p>Traver med logrende hale</p>
        </article>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
