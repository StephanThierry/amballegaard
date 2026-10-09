# Amballegaard

3D-isometrisk model af huset med autonome beboere. Se README.md for kørsel og struktur.

## Indsatte vektorer → placér møbler

Brugeren tegner vektorer i appen (📐 Vektor / tasten V) og indsætter tekst som:

```
[Amballegaard vektor V1]
Fra: x=16.85, z=11.40 (Stue) — på møbel id="sofa" "Sofa" (nu pos=[16.75, 11.3], rot=90°)
Til: x=18.60, z=13.80 (Stue)
Vektor: Δx=+1.75, Δz=+2.40 m · længde 2.97 m · retning 36°
```

Sådan tolkes den (aftalt med brugeren 2026-10-07):
- **Startpunktet er ankeret.** Møblet skal stå ved startpunktet. Starter vektoren ved en væg ("Væg ved start" er lille),
  skal møblets **bagside stå mod den væg**: placér centrum = vægflade + normal × (dybde/2).
- **Retningen er møblets front** (hvor man står/kigger fra, fx hvor en skærm vender hen, hvor man sidder fra).
  Rund **altid af til nærmeste 45°** (fx 88° → 90°, 40° → 45°) — et møbel står aldrig et par grader skævt. Brug den foreslåede `rot`.
- **Længden og "Til"-punktet er normalt ligegyldige.** Brug kun "Til" som mål, hvis brugeren skriver "flyt hertil".
- Starter vektoren **på et møbel**, er det møblet der menes (flyt/drej det), men samme regel gælder: start = ny plads,
  retning = front.
- Tjek at møblet ikke havner i en væg eller andre møbler (vægge i `data/house.json`, koordinater = vægmidterlinjer;
  ydervægge 0,34 m, indervægge 0,12 m). Brug møblets mål (komponenterne i `web/src/three/Furniture.tsx`).
- Vite hot-reloader `data/furniture.json`, så ændringen ses straks i browseren.

## Konventioner

- Meter, x mod højre og z nedad på plantegningen, y op. Origo = garagens vestvæg / nordligste facade.
- Simulationen er server-autoritativ (`src/Amballegaard.Simulation`); klienten tegner kun.
- `dotnet test` dækker husmodel, drag/drop, talebobler og porte. Kør den efter ændringer i data/house.json.
- **Ændrer du `data/house.json`, skal backenden genstartes.** Husmodellen indlæses som singleton ved opstart,
  mens `/api/house` sender filen rå — så en ny åbning eller hvidevare ser rigtig ud i browseren, mens
  simulationen ikke kender den, og `ToggleDoor` fejler tavst. `data/furniture.json` hot-reloades derimod.
- Serveren bygges uden apphost (`UseAppHost=false`), fordi Windows blokerer den nybyggede exe.

## Session-/token-økonomi

- **Lint:** kør `npm run lint 2>&1 | grep -c warning` og sammenlign med kendt baseline (74 pr.
  2026-10-09) i stedet for at printe hele listen. Dyk kun ned i fuld output hvis tallet har ændret sig.
- **Store filer:** brug `Grep -n` til at finde linjenumre først, læs derefter kun det relevante udsnit
  med `Read`'s `offset`/`limit` — undgå at læse hele `Furniture.tsx` (3100+ linjer) eller store
  `git diff`'er, når kun et lille udsnit er relevant.
- **Claude in Chrome — tjek dette FØRST ved "virker ikke i browseren":** læs `docs/3d-noter.md`
  afsnit 5 om `document.hidden`/rAF-throttling, før du kaster dig ud i en fejlsøgningsrunde med
  gentagne screenshots og syntetiske pointer-events. Et kendt symptom (fysik/animation reagerer ikke
  på træk) har sandsynligvis denne årsag, ikke en kodefejl.
- **Browser-verifikation generelt:** foretræk programmatiske tjek (konsol-fejl,
  `window.__scene`-forespørgsler, `window.__gl.info.render.frame`) frem for screenshots, når et
  ja/nej-svar er nok. Brug `browser_batch` til at samle flere handlinger i ét kald i stedet for mange
  enkeltstående. Luk faner med `tabs_close_mcp` når de ikke længere bruges.
- **Commit-opsplitning** (jf. stående ønske om én commit pr. diskret ændring): skriv den endelige kode
  direkte; opdel bagefter med målrettede `git diff`/`git apply`-patches eller `git add -p`-stil hunks
  for de filer der skal splittes — undgå at kopiere hele filer til scratch og genskrive dem flere gange.
- **`/compact`:** et naturligt tidspunkt at køre den er lige efter en committet og pushet ændring —
  det er allerede et fast tjekpunkt i arbejdsgangen her, så det kræver ingen ny vane, bare en
  tilføjelse til den eksisterende.

## Før du rører 3D-klienten

Læs **`docs/3d-noter.md`** før ændringer i `web/src/three`. Den har filkortet og de ting der ellers
koster tid at udlede igen: den fælles klik-mekanisme (`interact.tsx` — ingen knapper, man klikker på
objektet), afskæringen af vægåbninger i lave vægge (`clip.tsx` — ægte tværsnit, aldrig skalering),
orienteringen i en vægåbning (`out`, lokal +z, `swing`) som afgør hvilken vej en dør åbner og hvad
der er inder- og yderside, og tv-showene (`show.ts` + `TvShow.tsx`). Desuden kommandoer til
typecheck/lint, de faldgruber der koster mest tid (forældede Vite-moduler, house.json-genstarten),
og opskriften på at stille kameraet præcist via `window.__cc` når en ændring skal ses i browseren.

## Før du bygger dagsplan-motoren (Fase 4)

Læs **`docs/dagsplan-motor.md`** før du implementerer beboernes dagsplan/events (fx `tobed`,
`wakeup`, huslige gøremål). Den har den aftalte datamodel (en graf af `EventNode` pr. person,
adresseret via `(person, id)`, kædet sammen med `oncomplete`/`waitFor`), handlingsvokabularet
(`goto`/`speak`/`wait`/`setState`/`interact`/`chore`), hvorfor den erstatter en tidligere "schedule
+ delt event"-model, og den foreslåede implementeringsrækkefølge — skrevet før nogen kode fandtes,
så en session kan gå direkte i gang uden at genopfinde designet.
