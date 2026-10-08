import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Statisk batching: slår alle ubevægelige meshes under sig sammen til ét mesh pr. materiale (og skyggeopsætning),
 * så tusindvis af draw calls bliver til få. Det er CPU'en (antal draw calls), der begrænser svage maskiner.
 *
 * Originalerne skjules men bliver i scenen, så raycast (vektorværktøjet), bounding boxes (ObstacleReporter)
 * og React fortsat virker. Ting under userData.dynamic eller med klik-handlere (døre, låger, lamper) røres ikke.
 * Hvert sekund tjekkes en signatur af meshes/geometrier/positioner; ændres den (hot reload, glTF der er færdig
 * med at indlæse), bygges batchen igen.
 */
export function StaticBatch({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const root = useRef<THREE.Group>(null)
  const st = useRef({ sig: 0, next: 0, merged: [] as THREE.Mesh[], hidden: new Set<THREE.Object3D>() })

  const clear = () => {
    const s = st.current
    for (const m of s.hidden) m.visible = true
    for (const m of s.merged) { m.removeFromParent(); m.geometry.dispose() }
    s.hidden.clear()
    s.merged = []
    s.sig = 0
  }
  useEffect(() => {
    if (!enabled) clear()
    st.current.next = 0
    return clear
  }, [enabled])

  useFrame(({ clock }) => {
    const s = st.current
    const r = root.current
    if (!enabled || !r || clock.elapsedTime < s.next) return
    s.next = clock.elapsedTime + 1
    r.updateWorldMatrix(true, true)
    const meshes = collect(r, s.hidden)
    const sig = signature(meshes)
    if (sig === s.sig) return
    clear()
    s.sig = sig
    s.merged = build(r, meshes)
    for (const m of s.merged) r.add(m)
    for (const m of meshes) { m.visible = false; s.hidden.add(m) }
  })

  return <group ref={root}>{children}</group>
}

const hasHandlers = (o: THREE.Object3D) => {
  const h = (o as unknown as { __r3f?: { handlers?: object } }).__r3f?.handlers
  return !!h && Object.keys(h).length > 0
}

function batchable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (Array.isArray(m.material) || (m.material as THREE.MeshStandardMaterial).vertexColors) return false
  if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false
  const g = m.geometry
  return !!g.attributes.position && !g.morphAttributes.position && g.drawRange.count === Infinity
}

function collect(root: THREE.Object3D, hidden: Set<THREE.Object3D>) {
  const out: THREE.Mesh[] = []
  const visit = (o: THREE.Object3D) => {
    if (o !== root && (o.userData?.dynamic || o.userData?.batch || hasHandlers(o))) return
    if (!o.visible && !hidden.has(o)) return
    if (batchable(o)) out.push(o)
    o.children.forEach(visit)
  }
  visit(root)
  return out
}

function signature(meshes: THREE.Mesh[]) {
  let h = meshes.length
  for (const m of meshes) {
    const e = m.matrixWorld.elements
    h = (h * 31 + m.id * 7 + m.geometry.id * 13 + (m.material as unknown as { id: number }).id) | 0
    h = (h * 31 + Math.round(e[12] * 1000) + Math.round(e[13] * 1000) * 3 + Math.round(e[14] * 1000) * 5 + Math.round(e[0] * 1000)) | 0
  }
  return h || 1
}

function toFloat(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) {
  const out = new Float32Array(a.count * size)
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i)
    if (size > 1) out[i * size + 1] = a.getY(i)
    if (size > 2) out[i * size + 2] = a.getZ(i)
  }
  return new THREE.BufferAttribute(out, size)
}

/** Kopi af geometrien i root-koordinater med kun position/normal/uv og et Uint32-indeks (krav for at kunne flette). */
function prepare(src: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const g = new THREE.BufferGeometry()
  const pos = src.attributes.position
  g.setAttribute('position', toFloat(pos, 3))
  g.setAttribute('uv', src.attributes.uv ? toFloat(src.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2))
  const idx = src.index ? Uint32Array.from(src.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, i) => i)
  // Spejlet transform vender trekanternes omløbsretning — vend dem tilbage.
  if (matrix.determinant() < 0) for (let i = 0; i + 2 < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  if (src.attributes.normal) g.setAttribute('normal', toFloat(src.attributes.normal, 3))
  else g.computeVertexNormals()
  g.applyMatrix4(matrix)
  return g
}

function build(root: THREE.Object3D, meshes: THREE.Mesh[]) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const m4 = new THREE.Matrix4()
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geoms: THREE.BufferGeometry[] }>()
  for (const m of meshes) {
    const mat = m.material as THREE.Material
    const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`
    let grp = groups.get(key)
    if (!grp) groups.set(key, grp = { mat, cast: m.castShadow, recv: m.receiveShadow, geoms: [] })
    grp.geoms.push(prepare(m.geometry, m4.multiplyMatrices(inv, m.matrixWorld)))
  }
  const out: THREE.Mesh[] = []
  for (const grp of groups.values()) {
    const merged = mergeGeometries(grp.geoms, false)
    grp.geoms.forEach((g) => g.dispose())
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, grp.mat)
    mesh.castShadow = grp.cast
    mesh.receiveShadow = grp.recv
    mesh.userData.batch = true
    mesh.matrixAutoUpdate = false
    mesh.raycast = () => {} // klik og vektorer rammer originalerne, som kender deres møbel-id
    out.push(mesh)
  }
  return out
}
