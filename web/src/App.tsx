import { useEffect, useState } from 'react'
import { connect, useStore } from './store'
import { Scene } from './three/Scene'
import { Hud } from './ui/Hud'

export default function App() {
  const [error, setError] = useState<string | null>(null)
  const tool = useStore((s) => s.tool)
  useEffect(() => {
    connect().catch((e) => setError(String(e)))
  }, [])

  return (
    <div className={tool === 'vector' ? 'app tool-vector' : 'app'}>
      <Scene />
      <Hud />
      {error && <div className="error">Kunne ikke forbinde til serveren: {error}</div>}
    </div>
  )
}
