# Noter til 3D-klienten (`web/src/three`)

Arbejdsnoter til den der skal videre med rendering-koden. Skrevet 2026-10-08 efter arbejdet med
tværsnit i lave vægge, garageporte, yderdøres åbningsretning, den fælles klik-mekanisme og
tv-showet på stuens skærm.
Konventioner for hele projektet står i `CLAUDE.md`; kørsel og struktur i `README.md`.

## Filkort

| Fil | Ansvar |
|---|---|
| `Scene.tsx` | Canvas, kamera, sol/lys, efterbehandling. Slår `gl.localClippingEnabled` til i `onCreated` |
| `layout.ts` | `layoutWalls(house)` → vægsegmenter med normaler, `outward` og placerede åbninger. `wallTop()` bestemmer væghøjden pr. segment og visningstilstand |
| `Walls.tsx` | Selve murværket, bygget som flettede geometrier pr. materiale |
| `Openings.tsx` | Alt der sidder i et vægehul: vinduer, glasdøre, hoveddør, garageporte, pejs, indvendige døre |
| `clip.tsx` | `<ClipBelow>` + `useClip()` — vandret afskæring af åbninger i lav væghøjde |
| `interact.tsx` | `clickable()` / `<Clickable>` / `toggleProps()` — den fælles klik-mekanisme |
| `materials.ts` | Delte materialer + cache af afskårne kloner (`clippedMaterial`, `clippedMaterials`, `variantsOf`) |
| `Furniture.tsx` | Alt inventar (~2400 linjer). Møbeltype → komponent sidder nederst i `renderItem` |
| `show.ts` / `TvShow.tsx` | Tv-shows: manuskript og afspilningsposition / scenen på skærmen og taleboblerne |
| `games.ts` | Små procedurale "spil" som skærmtekstur (racer, blocks, obby, streamberry) |
| `Mower.tsx` | Robotplæneklipper + ladestation |
| `StaticBatch.tsx` | Fletter ubevægelige meshes sammen pr. materiale på lave grafikniveauer |

---

## 1. Den fælles klik-mekanisme (`interact.tsx`)

Der er **ingen knapper eller kontakter** i scenen. Alt der kan tændes/slukkes eller åbnes/lukkes
betjenes ved at klikke direkte på objektet. Registrering af et nyt klikbart objekt:

```tsx
import { Clickable, clickable, toggleProps } from './interact'

// 1) Nemmest — pak objektet ind:
<Clickable onActivate={() => toggleDoor('min-ting')}>…meshes…</Clickable>

// 2) Har du allerede en gruppe/mesh — spread handlerne på den:
<group {...clickable(() => doSomething())}>…</group>

// 3) Deler tingen tilstand med serveren (`snapshot.openDoors`) — genvej:
<group {...toggleProps('min-ting')}>…</group>
```

Det der er værd at vide:

- **Klik bobler op.** R3F sender hændelsen videre op gennem forældrene, så handleren skal kun sættes
  ét sted — på gruppen omkring objektet, ikke på hvert mesh.
- **Flere klikflader til samme ting:** giv hvert sted sin egen `<Clickable>` med samme `onActivate`
  (sådan virker plæneklipperen: robotten *og* ladestationen).
- `clickable()` sørger selv for `stopPropagation()`, markør-feedback og for at klik ignoreres mens
  📐 Vektor-værktøjet er aktivt (`useStore.getState().tool === 'vector'`).
- **StaticBatch springer objekter med klik-handlere over** (`hasHandlers` i `StaticBatch.tsx`), så de
  bliver ved med at kunne rammes af raycasteren. Det gælder hele undertræet under en `<Clickable>` —
  pak derfor ikke mere ind end nødvendigt, hvis der er mange meshes i spil.
- Objekter der animeres pr. frame skal have `userData={{ dynamic: true }}`, ellers fletter StaticBatch
  dem sammen i deres startposition.

Ting der i dag bruger mekanismen: døre og glasdøre (`HingedLeaf`), skydedør, garageporte, pejs,
køleskab, ovn, fryser (+ fryseskuffer), toiletlåg, Tärnaby-natlampen, robotklipper + ladestation.

---

## 2. Afskæring af åbninger i "Lave vægge" (`clip.tsx` + `materials.ts`)

**Problemet der blev løst:** `OpeningMesh` klemte før alle åbninger ned i den tilgængelige væghøjde
(`head = Math.min(op.head, top)`), og hver dørtype byggede sin geometri ud fra `head`. Så blev døre
skaleret ned i stedet for skåret over — værst for garageporten, der også afleder sektionshøjde,
skinner og buens radius af `head`.

**Sådan virker det nu:** åbningen bygges altid i sin rigtige størrelse (`op.head` uafkortet), og
`OpeningMesh` pakker indholdet i `<ClipBelow y={top}>`. Det er et vandret three.js-klippeplan
(`new THREE.Plane(new Vector3(0,-1,0), y)`) lagt i en React-context; `useClip()` leverer afskårne
materialer til alle underkomponenter. Resultatet er et ægte tværsnit — samme dør i alle modes,
savet over præcis hvor væggen er.

```tsx
const { m, planes, clip } = useClip()
// m      = alle de delte materialer fra materials.ts, afskåret
// clip() = skærer et vilkårligt materiale over (til modul-globale materialer som handleMat)
// planes = THREE.Plane[] | null, til materialer der oprettes lokalt med useMemo
```

**Regler når du tilføjer noget nyt inde i en åbning:**

- Brug `useClip().m` i stedet for `getMaterials()`.
- Opretter du et materiale selv, så giv det `clippingPlanes: planes` (og `clipShadows: true` hvis det
  kaster skygge) og sæt `planes` i `useMemo`-deps.
- Er materialet en modul-global konstant, så brug `clip(mitMaterial)`.
- **Muterer du et delt materiale pr. frame** (fx glassets natglød i `Scene.tsx`), så løb
  `variantsOf(mat)` igennem — ellers rammer ændringen kun den uklippede original.

Detaljer der er bevidste valg:

- `y = Infinity` slår afskæringen fra. `OpeningMesh` sender `top >= house.wallHeight ? Infinity : top`,
  så "Med tag"/"Uden tag" på de bagvedliggende vægge hverken bygger ekstra materialer eller
  shader-varianter.
- Klonerne caches pr. (materiale, højde) i `materials.ts`. Der findes reelt kun to højder i scenen
  (`LOW_WALL = 1.0` og `house.wallHeight = 2.6`), så det er en håndfuld ekstra materialer.
- Uigennemsigtige kloner får `side = DoubleSide`, så snitfladen viser indersiden af karmen i stedet
  for et hul. `shadowSide = BackSide` bevares, ellers giver de tynde plader skyggeartefakter.
- Klippeplanerne er i **verdenskoordinater**. Det går kun godt fordi huset kun roteres om Y —
  en vandret afskæring er uafhængig af `rotY`. Vipper du noget om X/Z, så husk det.
- `StaticBatch` grupperer efter `material.uuid`, så afskårne og uafskårne meshes fletter ikke sammen.
  Det er korrekt, men betyder lidt flere draw calls i lav væghøjde.

---

## 3. Orientering i vægåbninger — den vigtigste del at få rigtigt

Det her kostede mest tid at udlede. Gem det.

Hver åbning tegnes i en gruppe med `position=[x,0,z]` og `rotation=[0, rotY, 0]`, hvor
`rotY = atan2(-dir.z, dir.x)` for vægsegmentets retning. **I det lokale koordinatsystem:**

- **lokal +x** = langs væggen i segmentets `dir`-retning
- **lokal +z** = segmentets venstre-normal `n = [-dir.z, dir.x]`
- **`out` (= `seg.outward`, ±1)**: `out * (lokal +z)` peger **ud** af huset. `out` findes i
  `layout.ts` ved at teste om et punkt 0,3 m ude ad normalen ligger inde i `house.exterior`.
  Så: `out = +1` → ydersiden er lokal +z. `out = -1` → ydersiden er lokal −z.
- Alt der skal sidde på ydersiden placeres derfor ved `out * afstand`, indersiden ved `-out * afstand`.

**`HingedLeaf`** åbner bladet 90° mod `swing`-siden:

```
swing = +1  →  bladet svinger mod lokal +z
swing = out →  bladet svinger UD af huset        ← alle yderdøre
swing = -out→  bladet svinger IND i huset
swing = 1   →  indvendige døre (lokal +z-side)
```

`side` angiver hvilken vej bladet strækker sig fra hængslet (`+1` = mod +x). For dobbeltdøre er
blad 0 `side=1` hængslet i −x, og blad 1 `side=-1` hængslet i +x.

**Aktuel tilstand:** alle yderdøre og havedøre (`frontDoor`, `glassDoor`, `exteriorDoor`) åbner ud.
Indvendige døre åbner indad i rummet som før.

### Åbningstype → komponent

| `type` i `house.json` | Komponent | Noter |
|---|---|---|
| `window` | `GlazedUnit` | 2 ruder hvis bredere end 1,15 m; zinksålbænk ude, hvidt bundstykke inde |
| `glassDoor`, `exteriorDoor` | `GlazedDoor` | `leaves` styrer antal blade. Åbner ud |
| `frontDoor` | `FrontDoor` | Mørkt blad ude, hvidt inde. Åbner ud |
| `slidingDoor` | `SlidingDoor` | Lommedør, kører ind i væggen mod −x |
| `garageDoor` | `GarageDoor` | Ledport: 5 sektioner op ad skinne, kvart cirkel, så vandret langs loftet |
| `fireplace` | `Fireplace` | Gennemgående pejs, tændt/slukket deles via serverens `openDoors` |
| `frenchDoor` | `InteriorDoor glazed` | Hvidt blad med tre ruder |
| alt andet | `InteriorDoor` | Glat hvidt blad med to fyldinger |

Garageportens inderside er en tynd hvid plade på hver sektion ved `-out * 0.0245`. Når porten ligger
langs loftet er sektionerne roteret `+π/2` om x, så lokal +z peger **nedad** — den hvide side vender
altså ned i garagen. Samme greb bruges i `FrontDoor`.

---

## 4. Tv og shows (`show.ts` + `TvShow.tsx`)

Fladskærmene tændes og slukkes ved klik som alt andet. Når en skærm tændes, ruller streamingtjenestens
ident (et stort rødt bogstav + navnetræk), og derefter **fortsætter showet hvor det slap**.

Sådan hænger det sammen:

- **Tænd/sluk ligger på serveren.** En skærm skal stå i `appliances` i `data/house.json` med
  `kind: "tv"`, ellers afviser `World.ToggleDoor` id'et og klikket gør ingenting. Tilstanden kommer
  tilbage i `snapshot.openDoors` ligesom døre og pejs. `kind: "tv"` besøges ikke af beboerne —
  kun `fridge` og `freezer` er med i `World`s `visitable`.
- **Afspilningspositionen ligger uden for React**, i en `Map` pr. skærm-id i `show.ts`. Derfor
  betyder det ikke noget at `ShowScreen` afmonteres når skærmen slukkes: den fryser, og ved tænd
  starter den samme sted. Positionen nulstilles ved reload (den er bevidst ikke serverdelt).
- **Manuskriptet** er en liste af cues: `say(tekst, note?)` for en replik og `applause()` / `laugh()`
  for en regianvisning. Boblens levetid beregnes af `cueSeconds()` ud fra længden.
- **Replikkerne vises som talebobler** over tv'et med drei's `<Html>` og de samme CSS-klasser som
  beboernes (`avatar-label` + `bubble`), plus `tv` (bredere) og `reaction` (varm og kursiv).
- **Regianvisningerne driver publikum** nede på skærmen: `laughter` får silhuetterne til at vippe og
  hoppe med "HA" der stiger op, `applause` løfter hænderne op og klapper.

Et nyt show: tilføj det til `SHOWS` i `show.ts` og sæt `"show": "<nøgle>"` på et `kind: "tv"`-møbel i
`data/furniture.json`. Et tv uden `show` falder tilbage til `games[0]` (de procedurale spil).
Skærmen tegnes på et 480×270 canvas i `createScreen()` — ~20 fps er rigeligt for en baggrundsskærm.

---

## 5. Arbejdsgang og faldgruber

**Kør og tjek**

```bash
run                    # backend 5028 + vite 5173, åbner browseren
cd web && npx tsc -b --force   # typecheck (build-scriptet gør det samme)
cd web && npm run lint         # oxlint — ~40 forudbestående advarsler, se efter NYE
dotnet test                    # 27 tests, kun .NET-siden
```

- Serverne kører tit allerede. Tjek før du starter nye:
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`
- Vite hot-reloader både kode og `data/furniture.json`.
- **`data/house.json` kræver at backenden genstartes.** `Program.cs` laver `HouseModel.Load(...)` som
  singleton ved opstart, mens `/api/house` sender filen rå. Så en ny åbning eller hvidevare *ser*
  rigtig ud i browseren, men `World` kender den ikke, og `ToggleDoor` returnerer bare `false` — klik
  gør ingenting uden fejl nogen steder. Det koster nemt en halv times fejlsøgning. Genstart med
  `dotnet run --project src/Amballegaard.Server --launch-profile http`.
- **Efter mange hurtige filændringer (især via `sed -i`) kan Vite nå at servere en forældet
  transform** — symptomet er en `ReferenceError` om noget du lige har importeret, og et gammelt
  `?t=…`-stempel i stacktracen. Værre: scenen kører videre med gammel kode, så en ny klik-handler
  "virker bare ikke". `touch` filen og hard-reload, før du fejlsøger koden. Brug helst Edit-værktøjet
  frem for `sed -i` på filer under Vites watcher — `sed -i` erstatter filen ved omdøbning, og det
  er dét watcheren af og til misser.
- Undgå modul-globale aliasser af importerede funktioner (`const a = b` på topniveau) i de store
  filer; det mønster væltede en indlæsning her. Kald funktionen direkte på brugsstedet.
- Scenen er typisk 20–30 sekunder om at komme op (teksturer, HDRI, glTF). `window.__cc` findes først
  derefter — poll på den i stedet for at konkludere at noget er gået galt.

**Visuel verifikation i browseren** (Claude in Chrome)

`Scene.tsx` lægger CameraControls på `window.__cc` og scenen på `window.__scene` i dev. Det er langt
hurtigere end at klikke sig frem — stil kameraet præcist og tag et screenshot:

```js
const cc = window.__cc
await cc.setLookAt(camX, camY, camZ, targetX, targetY, targetZ, false)
await cc.zoomTo(150, false)   // ortografisk: højere tal = tættere på
```

Virker et klik ikke, så tjek først om handleren overhovedet sidder i scenen — det skiller "ramte
forkert" fra "koden er ikke indlæst":

```js
const hits = []
window.__scene.traverse(o => { if (Object.keys(o.__r3f?.handlers ?? {}).length) hits.push(o.getWorldPosition(new o.position.constructor())) })
hits.length   // 0 = modulet er ikke loadet (se den forældede Vite-transform ovenfor)
```

Nyttige koordinater (meter, se `data/house.json`):

| Hvad | Position |
|---|---|
| Garageporte | `[0, 3.43]` og `[0, 6.2]`, vender mod vest |
| Hoveddør | `[18.65, 0]`, vender mod nord |
| Terrassedør (alrum, 2 blade) | `[14.22, 8.11]`, vender mod syd |
| Pejs | `[16.85, 8.11]`, i den indvendige væg `stue-n` |
| Ladestation til klipperen | `[19.35, 17.6]` på terrassen |
| Stue-tv (Honorable Primate) | `[15.8, 11.65]`, y 1,2 — se det fra fx `(19.4, 2.3, 13.2)` |
| Huset ellers | x 0–23,47 · z 0–20,04 · væghøjde 2,6 |

Gode tjek: skift mellem *Uden tag* og *Lave vægge* med samme kameraopstilling — en åbning skal se
**identisk** ud i den nederste meter. Åbningsretning ses klarest i et rent fugleperspektiv
(`setLookAt(x, 20, z-1.5, x, 0, z+0.6)`), hvor bladet tydeligt stikker ud til den rigtige side.

**Vær opmærksom på**

- Simulationen er server-autoritativ. Døre, pejs, hvidevarer og klipper skiftes via SignalR
  (`toggleDoor`, `toggleMower` i `store.ts`) — klienten animerer bare mod `snapshot`-tilstanden.
  Et klik kan derfor tage et snapshot-interval (200 ms) før det ses.
- Beboerne åbner og lukker selv døre hele tiden; en dør du efterlod åben siger intet om din kode.
- Klikker du ved siden af et objekt, rammer strålen tit en avatar bagved (beboer-panelet popper op
  nederst til højre) — det er et godt signal om at du ramte forkert, ikke at mekanismen er i stykker.
- Møbler er **ikke** afskåret i lav væghøjde (de bruger `getMaterials()` direkte). Høje skabe stikker
  derfor op gennem lave vægge. Det er sådan det har været hele tiden; skal det laves om, er opskriften
  den samme `<ClipBelow>` som i `Openings.tsx`.
