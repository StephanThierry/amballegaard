# Amballegaard — interaktivt 3D-hus med autonome beboere

Isometrisk 3D-model af huset (fra `images_and_floorplan/`) med beboere, der lever i huset.
Simulationen kører på serveren (.NET 10), og browseren tegner med Three.js.

## Kør lokalt

```
run            # backend + frontend med hot reload, åbner http://localhost:5173
run -NoBrowser # uden at åbne browseren
run -Prod      # bygger frontenden ind i wwwroot og kører kun backend på http://localhost:5028
```

`run.cmd` starter `run.ps1` uden at Windows' script-politik blokerer den (i PowerShell: `.\run`).
Ctrl+C stopper begge servere.

### Manuelt (udvikling)

Beboere: Stephan, Lisa, Max-Emil, Mathilde og hunden.

```bash
# 1. Backend: simulation + API + SignalR på http://localhost:5028
dotnet run --project src/Amballegaard.Server --launch-profile http

# 2. Frontend med hot reload på http://localhost:5173 (proxyer /api og /hubs til backend)
cd web && npm install && npm run dev
```

Produktion: `cd web && npm run build` lægger frontenden i `src/Amballegaard.Server/wwwroot`,
så `dotnet run --project src/Amballegaard.Server` serverer alt fra én proces.

Tests: `dotnet test`

## Struktur

| Sti | Indhold |
|---|---|
| `data/furniture.json` | Alt inventar: id, navn, type, pos [x, z], rot i grader. Hot-reloades i browseren. |
| `data/house.json` | Hele husets geometri i meter: vægge, åbninger, rum, tage, have. Aflæst fra plantegningen (70,4 px/m). |
| `src/Amballegaard.Simulation` | Domænelogik uden web: husmodel, geometri, beboere, `World.Tick()` |
| `src/Amballegaard.Server` | ASP.NET: `SimulationHost` (10 Hz tick, 5 Hz snapshots), `WorldHub` (SignalR), REST |
| `web/src/three` | Rendering: vægge, tage, åbninger, møbler, have, avatarer, lys/sol |
| `web/src/three/textures.ts` | Procedurale PBR-teksturer (tegl, klinker, fliser, tagpap, hæk) |
| `web/public/assets` | CC0-assets fra Poly Haven (egeplank, græs, HDRI, møbler) |

## Betjening

- Venstre mus: drej · højre mus: panorer · scroll: zoom · **Q/E**: drej 90°
- Visning: *Med tag* / *Uden tag* / *Lave vægge* (standard)
- Klik på en beboer (eller i listen) for at vælge og følge med kameraet
- **Træk en beboer** med venstre mus for at flytte den — den vandrer derefter i det rum (eller det sted i haven), hvor den blev sat
- Beboerne siger tilfældige ting i talebobler (50 replikker i `src/Amballegaard.Simulation/Agents/Speech.cs`)
- **Døre**: klik på en dør for at åbne/lukke den; beboerne åbner selv de døre de går igennem
- **Garageportene** (ledporte der kører op og ind langs loftet) åbnes/lukkes med den lysende knap på indersiden ved hver port
- **📐 Vektor** (tasten V): træk med musen fra et møbel til hvor det skal hen. Teksten kopieres automatisk og kan indsættes i Claude, som så retter `data/furniture.json` (se CLAUDE.md). Esc afslutter

## Status

- [x] Fase 0 – Solution, SignalR, Vite-proxy, build til wwwroot
- [x] Fase 1 – Husets geometri fra plantegningen, snit-visning, rotation
- [~] Fase 2 – Tage, ovenlys, terrasser, hække, PBR-materialer, møbler (første version)
- [x] Fase 3 – Navgrid + A*: beboerne går mellem rummene, uden om møbler, og åbner/lukker dørene undervejs
- [ ] Fase 4 – Behov, utility-AI, døgnrytme, riggede avatarer med animationer
- [ ] Fase 5–6 – Atmosfære, eventlog, persistens (SQLite)
