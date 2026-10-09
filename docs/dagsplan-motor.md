# Dagsplan-motor — plan og datastruktur (endnu ikke implementeret)

Status: dette er **kun en plan**, aftalt med brugeren 2026-10-09, før nogen kode er skrevet. Dækker
Fase 4 i README.md ("Behov, utility-AI, døgnrytme"). Formålet er at give beboerne en data-drevet
dagsplan — fx `tobed` (forældre finder børnene, følger dem i det lille badeværelse, børnene sover
til et fast tidspunkt) og `wakeup` (voksne vækker børn, alle spiser sammen i køkkenet) — hvor **nye
events kan skrives af en LLM i en fremtidig session, ud fra en separat specifikationsfil, uden at
røre C#-kode**.

Denne fil er beslutningsloggen/arkitekturen. Når implementering går i gang, skal der desuden skrives
en `docs/dagsplan-events-spec.md` (eller lignende) som er selve kontrakten en LLM forfatter
event-filer ud fra — se afsnit 9.

## 1. Eksisterende byggesten der skal genbruges, ikke genopfindes

- **`World.SimTime`** (`TimeSpan` siden midnat dag 1), `TimeScale`, `Paused`, `JumpToTimeOfDay` —
  urgrundlaget findes allerede i `src/Amballegaard.Simulation/World.cs`.
- **`StepLove`** (samme fil) er i praksis et lille, hardkodet scene-system: faser, cooldown,
  path-finding til et mødepunkt, scriptede replikker via `LoveScript`/`LoveLine`, og et
  `InLoveMeeting`-flag der suspenderer normal vandre-AI. Den nye motor generaliserer dette mønster —
  genbrug tankegangen, ikke nødvendigvis koden 1:1.
- **`Agent.HeldDoors` / `ApplianceDef` / `PendingAppliance`** — den eksisterende åbn/kig/luk-mekanik
  for køleskab og fryser (`World.PlanIndoorWalk`) er allerede den rigtige model for den nye
  `interact`-handling (se afsnit 4) — skal udvides til at dække flere apparater (fx opvaskemaskine:
  `data/house.json` har allerede `koekkenoe-opvask`, `kind: "dishwasher"`, med `standAt`, men den er
  endnu ikke koblet til åbne/lukke-mekanikken), ikke genopfindes.
- **`Speech.cs`** — replikpuljer og `Say(agent, text, seconds)`. Genbruges af `speak`-handlingen.
  Der findes allerede en løs replik til opvaskemaskinen (`"Jeg tømmer lige opvaskeren."`).
- **`house.json` appliance `standAt`** — mønsteret for navngivne ståpunkter genbruges til `goto`
  med `kind: "point"` og til at undgå at flere beboere lander oven i hinanden i et lille rum (fx
  `badN`, det lille badeværelse mellem Max-Emils og Mathildes værelser).

## 2. Kerneidé: graf af `EventNode` pr. person, ikke "schedule-fil + delt event-fil"

Første udkast til denne plan foreslog to filtyper (en "schedule"-fil pr. person med simple
tidsblokke, og separate "event"-filer med rolle-slots delt mellem personer). **Det er forkastet**
til fordel for én enklere model: hver person har én fil med en liste af `EventNode`, og
tidstriggede noder i den fil **er** personens dagsplan. Tværpersonlig påvirkning sker udelukkende
via `oncomplete`, som frit kan pege ind i en anden persons fil.

Pointen: en "scene" er ikke en selvstændig datastruktur — den er bare den delgraf, der kan nås fra
én tidstrigget rod-node via `oncomplete`-kæder, eventuelt på tværs af flere personers filer.

## 3. `EventNode` — felter

```
person:   "stephan"            // aktøren der udfører handlingen
id:       15                   // unikt inden for denne persons fil
trigger:  { type: "time", value: "20:30" }   // eller: { type: "passive" }
action:   { ... }               // se afsnit 4
oncomplete: [ { person: "stephan", id: 16 }, { person: "maxemil", id: 20 } ]
chain:    "tobed"               // valgfrit, kun til debugging/gruppering — se afsnit 6
waitFor:  [ { person: "...", id: ... } ]   // valgfrit, se afsnit 3.2 (fan-in / join)
```

- **Adressering**: global nøgle er altid parret `(person, id)` — det er sådan `oncomplete` og
  `waitFor` refererer på tværs af filer.
- **Filplacering**: `data/events/<person>.json` — én fil pr. beboer, liste af `EventNode`.

### 3.1 Triggertyper

- **`time`**: rod-/indgangspunkt. Skal rearmes hver simulerede dag. Trigger-tjek skal ske ved
  **krydsning** mellem forrige og denne tick (ikke `>=`), så store tidsspring ved høj `TimeScale`
  ikke springer klokkeslættet over — samme teknik som `UpdateHeldDoors`/`DoorOpenAhead` allerede
  bruger til dørkrydsninger. Skal håndtere `Paused` og `JumpToTimeOfDay` uden at fyre dobbelt eller
  slet ikke.
- **`passive`**: fyrer **aldrig** af sig selv. Kører kun når en anden nodes `oncomplete` peger på
  den. En passiv node der ikke er mål for noget `oncomplete` nogen steder i den samlede filmængde,
  er en fejl (se validering, afsnit 8).

### 3.2 Fan-out og fan-in

- **Fan-out** er `oncomplete` med flere mål (som i brugerens oprindelige eksempel: én nodes
  `oncomplete` trigger både en node for Max-Emil og en for Stephan).
- **Fan-in / join** ("vent til begge børn er klar, før næste trin") dækkes af det valgfrie
  `waitFor`-felt: en node med `waitFor` udføres først, når **alle** refererede noder er markeret
  færdige. Ikke nødvendigt for `tobed`/`wakeup`-eksemplerne, men skal være en del af modellen fra
  start — det kommer uundgåeligt op (fx "spis sammen" kræver at alle er ankommet, før måltidet
  starter).

## 4. Handlingsvokabular (`action.type`)

| type | felter | "færdig" betyder |
|---|---|---|
| `goto` | `target: { kind: "room"\|"person"\|"point", value }` | ankommet til mål |
| `speak` | `text` (eller `lineRef` ind i `Speech.cs`-puljer) | replikkens visningstid udløbet |
| `wait` | `seconds` | tiden gået |
| `setState` | `activity`, evt. `pose` | fyrer øjeblikkeligt (se nedenfor) |
| `interact` | `target` (appliance-/dør-id), `state: "open"\|"closed"` | tilstanden er skiftet |
| `chore` | `points: [id, id, ...]`, `activity`, `duration: {min, max}` (eller `cycles`) | varigheden/cyklusserne er udløbet |

Noter pr. type:

- **`goto` med `kind: "person"` er dynamisk**: find målet der hvor det *er*, og path-replanlæg hvis
  det bevæger sig undervejs. `kind: "room"/"point"` er statiske mål. Vigtig skelnen, skal stå
  eksplicit i spec-filen.
- **`setState` er øjeblikkelig** — den sætter `Activity` og fyrer straks sin `oncomplete`. En
  tilstand som "sover" varer ikke fordi noden "er i gang", men fordi der ikke er noget
  `oncomplete`, og ingen anden kæde rører personen før en fremtidig node (typisk en andens
  `goto person=X` næste morgen) trækker vedkommende ind i en ny kæde. Dette er bevidst — en
  handling behøver **ikke** et specialtilfælde for "påvirker en anden person end aktøren", fordi
  `oncomplete` frit kan pege på en node ejet af en helt anden person (se opvaskemaskine-eksemplet,
  afsnit 10, og wakeup-mønsteret: Stephans `goto→maxemil` kan i sin `oncomplete` trigge en passiv
  node ejet af Max-Emil, der vækker ham).
- **`interact` ændrer verden, ikke kun aktøren** — samme delte, synlige tilstand som
  `OpenDoors`/`_lampLevels` i `World.cs` i dag. Skal kalde **samme underliggende kanal** som
  brugerens klik på et apparat (ikke en ny mekanisme), så event-styret og bruger-styret interaktion
  aldrig kan modsige hinanden. Afbrydelse midt i (bruger trækker aktøren væk mens fx opvaskeren
  står åben): følg samme regel som køleskab/fryser i dag — luk den, så verden ikke efterlades i en
  synligt forkert tilstand.
- **`chore` undgår at skulle udskrive hvert eneste skridt** for gentagne huslige gøremål (tømme
  opvaskemaskine, folde vasketøj, dække bord). Motoren pendler internt mellem de navngivne punkter
  i den angivne varighed, med jitter (samme stil som `IdleSeconds`-tilfældigheden andre steder i
  `World.cs`) — **ikke** et fast antal literale `goto`-noder.

## 5. Statisk graf vs. daglig kørsel

Filerne definerer en **skabelon**-graf. Ved hver ny simuleret dag opretter motoren en frisk
"instans": hvilke rod-noder der er fyret, og hvilke passive noder der er invokeret, **den dag**.
Nødvendigt fordi (a) tidstriggede rod-noder skal fyre hver dag, ikke kun én gang globalt, og
(b) hvis to forskellige rod-kæder samme dag skulle ende med at pege på samme passive node, skal
motoren kunne opdage og afvise dobbelt-invokation inden for den kørsel. Dette er ren
runtime-bogføring (`(person, id, dato) → pending/active/done`), ikke noget der står i filerne.

## 6. Afbrydelse og fejl-robusthed

- Mens en aktør har en aktiv node i gang, suspenderes dens normale vandre-/snak-/kærligheds-AI —
  generisk udgave af `InLoveMeeting`-mønsteret, pr. node i stedet for ét hardkodet flag.
- **Knækket kæde** (bruger trækker/deaktiverer en aktør midt i en node): **ingen tvungen
  gennemførsel**. Lad kæden gå i stå og dø (log det), frem for at tvinge `oncomplete` igennem efter
  en timeout. Dette er et livssimuleringsmiljø, ikke en missionskritisk workflow-motor — i morgen
  fyrer rod-noden igen, og alt er frisk. Skal stå eksplicit i spec-filen, så en fremtidig
  LLM-forfatter ikke antager "garanteret levering" af en kæde.
- `chain`-feltet (afsnit 3) er **rent kosmetisk** — kun til logning/debugging/UI-visning af "hvilket
  forløb er denne agent i gang med". Motoren har ingen semantik der kræver det.

## 7. Dynamisk indlæsning

- `data/events/<person>.json` scannes som mappe, ikke en indekseret masterliste — en ny fil skal
  kunne dukke op uden at noget andet sted redigeres.
- **Anbefaling: hot-reload**, ligesom `data/furniture.json` i dag (jf. CLAUDE.md), **ikke**
  genstart-krævende som `data/house.json`. Pointen med data-drevne events er netop iterativ
  LLM-forfatning, og det kræver at ændringer ses med det samme.

## 8. Validering ved indlæsning

Én ugyldig fil må **ikke** vælte hele simulationen — log og spring kun den fil/node over.

- Enhver `passive`-node skal være mål for mindst ét `oncomplete`/`waitFor` et sted i den samlede
  filmængde (orphan-detektion).
- Enhver `oncomplete`/`waitFor`-reference til `(person, id)` skal eksistere.
- Grafen skal være **cyklefri** inden for én kørsel.
- `goto`-mål (rum-id, person-id, punkt-id) og `interact`-mål (appliance-/dør-id) skal eksistere i
  **ID-indekset** (afsnit 9.2) — det er loaderens ene kilde til sandhed for gyldige id'er, ikke en
  selvstændig genimplementeret liste oven i `house.json`/familien.
- To `trigger: time`-noder for samme person på samme klokkeslæt er formentlig en fejl — bør flages.
- Hvert event-node-dokument bør bære et `schemaVersion`-felt, så motoren kan afvise filer skrevet
  mod en forældet spec i stedet for at mistolke dem stille.

## 9. Dokumentation til LLM-forfatning: spec-fil + ID-indeks

To artefakter skal findes, før en **uafhængig** LLM-session (uden adgang til at læse C#-koden eller
hele `house.json`) kan planlægge og skrive et nyt event-forløb ved kun at kende disse to dokumenter.

### 9.1 `docs/dagsplan-events-spec.md` — modellen: typer, actions, fremgangsmåde

Denne plan (nærværende fil) er arkitektur-beslutningsloggen. Spec-filen er den separate,
udtømmende **kontrakt** en LLM skriver event-filer ud fra, og skal dække præcis tre ting:

- **Typer** — de to triggertyper (afsnit 3.1): `time` (rod/indgang, rearmes hver simulerede dag) og
  `passive` (kører kun via `oncomplete`), samt det valgfrie `waitFor`-fan-in-felt (afsnit 3.2).
  Eksplicit: ingen to `time`-noder for samme person på samme klokkeslæt; en `passive`-node uden
  nogen der peger på den er en fejl.
- **Actions** — det fulde handlingsvokabular (afsnit 4): `goto`/`speak`/`wait`/`setState`/
  `interact`/`chore`, med felter, gyldige værdier og "færdig"-semantik for hver — inkl. at
  `goto(kind:person)` er dynamisk mens `goto(kind:room|point)` er statisk, at `setState` er
  øjeblikkelig, og at `chore` er den foretrukne måde at udtrykke gentagne bevægelser på i stedet for
  literal nodeudrulning.
- **Fremgangsmåde** — den skridt-for-skridt metodologi en LLM skal følge, ikke kun en
  referenceliste:
  1. Slå gyldige id'er op i ID-indekset (9.2) — opfind aldrig et id, og brug aldrig rå koordinater
     hvor et navngivet punkt findes.
  2. Placér nye noder i **aktørens egen** `data/events/<person>.json` — tidstriggede noder er den
     persons dagsplan, så et nyt forløb skal passe ind uden at kollidere med personens
     eksisterende tidstriggede noder.
  3. Wire `oncomplete`/`waitFor` på tværs af personers filer via `(person, id)`-par.
  4. Kør valideringskommandoen (del af `dotnet test`, afsnit 8) og ret orphan-noder, dangling
     referencer og cykler før forløbet anses for færdigt.
  5. Hvis forløbet bruger jitrede varigheder (`wait`/`chore`): husk determinisme-kravet fra afsnit
     13.3, ellers bryder tidsforskydnings-resolve.

Indeholder desuden `schemaVersion`-feltet (afsnit 8), 2-3 fuldt udfoldede eksempelfiler som
skabelon (afsnit 10), advarsel om pladstrængsel i små rum (`badN`), og den eksplicitte regel om
ingen tvungen kæde-gennemførsel (afsnit 6).

### 9.2 ID-indeks — ét lokalt opslagsfil for alle gyldige id'er

For at en LLM kan skrive et nyt forløb **uden** at læse `house.json` (vægge/tage/have — primært
irrelevant for event-forfatning) eller C#-koden, skal der findes **ét** samlet, curated
opslagsfil, fx `data/events/index.json`, med alle id'er en event-fil kan referere til:

```
{
  "rooms":   [ { "id": "badN", "name": "Badeværelse" }, ... ],
  "persons": [ { "id": "maxemil", "name": "Max-Emil", "kind": "Child", "homeRoomId": "v2" }, ... ],
  "points":  [ { "id": "koekkenoe-opvask", "kind": "dishwasher", "roomId": "koekken" }, ... ]
}
```

- **Genereres, skrives ikke i hånden.** Vedligeholdes den manuelt ved siden af `house.json`/
  `Family.cs`, går den før eller siden ud af sync — samme risiko CLAUDE.md allerede advarer om
  mellem `house.json` og `/api/house`. Den skal i stedet **afledes automatisk** af de autoritative
  kilder (`house.json`s `rooms`/`appliances`/relevante `openings`, og `Family.cs`s agent-liste), ikke
  skrives som en selvstændig, parallel kilde til sandhed.
- **Hot vs. genstart**: bør følge `house.json`s regel (genstart nødvendig, da den afledes af samme
  kilde), medmindre den genereres on-demand ved hvert opslag/API-kald — i så fald er den altid frisk
  uden separat genstarts-overvejelse. Afklares ved implementering.
- **Samme fil bruges til validering** (afsnit 8): loaderens eksistens-tjek af `goto`-/
  `interact`-mål slår op i præcis dette indeks — én kilde til sandhed for "hvilke id'er er gyldige",
  delt mellem LLM-forfatning og motorens egen validering.

## 10. Udfoldede eksempler (til brug i spec-filen)

### `tobed` (uddrag — Stephan finder Max-Emil, siger god nat-replik, begge går i badeværelset)

```
{ person: "stephan", id: 12, trigger: { type: "time", value: "19:30" },
  action: { type: "goto", target: { kind: "person", value: "maxemil" } },
  oncomplete: [ { person: "stephan", id: 15 } ] }

{ person: "stephan", id: 15, trigger: { type: "passive" },
  action: { type: "speak", text: "Så skal vi gøre klar til at komme i seng." },
  oncomplete: [
    { person: "maxemil", id: 20 },
    { person: "stephan", id: 16 }
  ] }

{ person: "maxemil", id: 20, trigger: { type: "passive" },
  action: { type: "goto", target: { kind: "point", value: "badN" } },
  oncomplete: [] }

{ person: "stephan", id: 16, trigger: { type: "passive" },
  action: { type: "goto", target: { kind: "point", value: "badN" } },
  oncomplete: [] }
```

(Søvn-overgangen — `setState(activity="sleeping")` for barnet efter badeværelset, og den
efterfølgende vågne-kæde om morgenen — er beskrevet i princippet i afsnit 4, men ikke fuldt
udfoldet her; skal færdiggøres ved implementering.)

### Tøm opvaskemaskine (fuldt eksempel, viser `interact` + `chore`)

```
{ person: "lisa", id: 30, trigger: { type: "time", value: "08:00" },
  action: { type: "goto", target: { kind: "point", value: "koekkenoe-opvask" } },
  oncomplete: [ { person: "lisa", id: 31 } ] }

{ person: "lisa", id: 31, trigger: { type: "passive" },
  action: { type: "interact", target: "koekkenoe-opvask", state: "open" },
  oncomplete: [ { person: "lisa", id: 32 } ] }

{ person: "lisa", id: 32, trigger: { type: "passive" },
  action: { type: "chore", points: ["koekkenoe-opvask", "koekkenoe-skab"],
            activity: "tidying", duration: { min: 40, max: 70 } },
  oncomplete: [ { person: "lisa", id: 33 } ] }

{ person: "lisa", id: 33, trigger: { type: "passive" },
  action: { type: "interact", target: "koekkenoe-opvask", state: "closed" },
  oncomplete: [] }
```

## 11. Åbne beslutninger (ikke taget stilling til endnu)

- Skal `chore`/husligt arbejde kræve en logisk tilstand som "opvaskeren er fuld"? I dag findes kun
  åben/lukket, ingen "indeholder beskidt service"-tilstand. Foreslået fravalgt indtil videre
  (samme pragmatiske niveau som resten af simulationen — `StepLove` tjekker heller ikke "har de
  tid").
- Ugedags-/weekend-variation af dagsplanen — ikke nødvendigt for de nævnte eksempler, men bør kunne
  tilføjes som et `days`-felt på `trigger: time` uden at bryde modellen.
- Nøjagtig varighed/tidspunkt for børnenes opvågning (fast kl. 07:30, eller med spredning) —
  afklares ved implementering af `wakeup`.

## 12. Foreslået implementeringsrækkefølge

1. **ID-indeks-generator** (afsnit 9.2): aflæs `house.json`/`Family.cs` og skriv
   `data/events/index.json`. Skal findes **før** loaderen, da dens validering (næste trin) bruger
   indekset som kilde til sandhed.
2. `EventNode`-model + loader (mappe-scan af `data/events/*.json`, hot-reload, validering jf.
   afsnit 8 mod ID-indekset) — ingen ny agent-adfærd endnu, bare data ind og valideret.
3. Klokkeslæt-trigger (krydsningstjek, daglig rearming, robust over for `TimeScale`/`Paused`/
   `JumpToTimeOfDay`) som selvstændig, testet byggesten.
4. Generisk node-afvikling for `goto`/`speak`/`wait`/`setState` (dækker `wakeup`, som er simplere:
   ét samlingspunkt i køkkenet, intet pladsproblem).
5. Udvid med `interact`/`chore` (dækker opvaskemaskine-eksemplet og lignende huslige gøremål).
6. Implementér `tobed` fuldt ud (sværere: forgrenet børn/voksne-logik, lille badeværelse,
   efterfølgende søvntilstand til variabelt vågn-tidspunkt).
7. Skriv `docs/dagsplan-events-spec.md` (afsnit 9.1) sideløbende med trin 1-6 — specen *er*
   kontrakten for loaderen, så de skal udvikles sammen, ikke specen bagefter.
8. Klient-animationer/poser for de nye `Activity`-værdier (`sleeping`, `tidying`, …) kan komme
   sidst — kan vises som stillestående i den rigtige position/pose, indtil riggede avatarer
   (sidste del af Fase 4, jf. README) er klar.
9. Test-strategi, jf. eksisterende `dotnet test`-mønster (husmodel, drag/drop, porte, talebobler):
   dæk (a) at et event udløses præcis én gang/dag, også ved høj `TimeScale` og efter
   `JumpToTimeOfDay`, (b) at alle deltagere ender rigtigt sted med rigtig `Activity`, (c) at en
   bruger-afbrydelse (drag/`SetActive`) midt i et event rydder op uden at nogen sidder fast.
10. Tidspanel-UI og tidsforskydning med resolve (afsnit 13) — separat delopgave, kan komme efter
    trin 1-6 er på plads, da resolve-mekanismen forudsætter at event-grafen og dens varigheder
    allerede findes.

## 13. Tidspanel-UI og tidsforskydning (resolve-on-jump)

Aftalt med brugeren 2026-10-09, oven på grundmodellen i afsnit 1-12. Ændrer både UI'et
(`web/src/ui/Hud.tsx`) og tilføjer et nyt stykke serverlogik (tidsforskydning med
tilstands-resolve), som ikke fandtes i den oprindelige plan.

### 13.1 Ny tidspanel-UI

I dag (`Hud.tsx`): `SPEEDS = [1, 60, 300, 1200]` + pause + "Spring til solopgang/solnedgang"
(`JumpToTimeOfDay`, altid fremad — kommentaren i `World.cs` siger eksplicit "tiden går aldrig
baglæns"). Erstattes af:

- **Pause / 1× / 2×** — kun disse tre. Vigtig forskel fra i dag: **2× skal betyde at avatarerne
  rent faktisk bevæger sig dobbelt så hurtigt**, ikke (som i dag) at uret løber hurtigere mens
  avatarerne går i deres sædvanlige realtids-tempo. `StepWander`'s bevægelsesskridt
  (`agent.Speed * dt`, hvor `dt` i dag er **realDt**, uanset `TimeScale`) skal ganges med
  `TimeScale` for at opnå det — en adfærdsændring i eksisterende kode, ikke kun UI. De gamle
  høje multiplikatorer (60×/300×/1200×, "spol dagen hurtigt frem mens avatarerne går normalt") giver
  ikke mening længere, for der er nu et separat værktøj til at springe i tid (næste punkt).
- **-30 min / +30 min** — ny, **relativ** tidsforskydning, i modsætning til dagens absolutte,
  kun-fremad `JumpToTimeOfDay`. **Præcisering**: `-30 min` er ikke en vedvarende baglæns-kørende
  klokke — det er præcis samme mekanik som `JumpToTimeOfDay` allerede bruger i dag (ét diskret
  "sæt `SimTime` til denne værdi"-øjeblik), bare uden fremad-kun-klampen (`if (target <= SimTime)
  target += 1 dag`). Lige efter springet tikker `SimTime` videre fremad som altid, med den
  aktuelle `TimeScale`. Det betyder der **ikke** er noget "spol simuleringen baglæns"-problem at
  løse (ingen RNG-reversering, ingen vedvarende retning at holde styr på) — kun selve øjeblikket
  hvor den nye værdi er lavere end den gamle. Kræver formentlig en ny RPC, fx `ShiftTime(minutes)`
  (kan være negativ), adskilt fra `JumpToTimeOfDay`.

**Åbent**: bevares "Spring til solopgang/solnedgang"? De har i dag præcis det samme problem som
±30 min-knapperne skal løse (abrupt tidsspring efterlader avatarerne i en forældet tilstand) — hvis
de bevares, bør de route gennem samme resolve-mekanisme (13.3), ikke blot kalde `JumpToTimeOfDay`
som i dag.

### 13.2 Hvorfor et tidsspring kræver resolve, ikke bare at ændre `SimTime`

Et spring i `SimTime` alene efterlader hver agent fysisk der, hvor den stod **før** springet, selvom
klokken nu siger noget andet — det ser forkert ud (barnet står midt i stuen kl. 23:00) og er direkte
forkert for alle der er inde i en event-kæde (en der var på vej i seng kl. 19:35 skal efter et spring
til 20:00 **stå i deres eget værelse og sove**, ikke stadig være på vej gennem badeværelset).
Derfor skal et tidsspring trigge en **genberegning (resolve) af hver persons tilstand** ud fra deres
egen event-graf (afsnit 3), ikke blot flytte uret.

### 13.3 Resolve-mekanismen: analytisk gennemgang af grafen, ikke tick-for-tick-afspilning

For hver person, ved ethvert tidsspring (±30 min, og evt. solopgang/solnedgang hvis de bevares):

1. Gå gennem personens event-graf fra dagens relevante tidstriggede rod-node(r), og **akkumulér
   varighed pr. node** indtil den samlede tid passerer måltidspunktet:
   - `goto`: varighed = stifindingsafstand (NavGrid) ÷ `agent.Speed` — beregnes **geometrisk**, ikke
     ved at simulere bevægelsen tick for tick.
   - `wait`/`chore`: fast varighed, eller jitret (`duration.min`/`max`).
   - `speak`: replikkens visningstid.
   - `setState`/`interact`: øjeblikkelig (0 sekunder).
2. Den node hvor den akkumulerede tid passerer måltidspunktet er **"aktiv" ved måltidspunktet**. Er
   det en `goto` midt i forløbet, interpolér positionen langs stien ud fra hvor stor en andel af
   nodens varighed der er gået.
3. Snap agenten direkte til den beregnede tilstand (position + `Activity`) — ingen animeret gang,
   springet skal opleves som øjeblikkeligt.

**Determinisme er afgørende**: jitrede varigheder (`wait`/`chore`) må **ikke** trække et nyt
tilfældigt tal for hvert resolve-kald — ellers giver gentagne -30/+30-klik ikke samme resultat igen
(man kan ikke springe frem og så tilbage og lande samme sted). Jitter skal seedes deterministisk pr.
node-instans (fx af dato + person + node-id), så resolve er en **ren funktion** af måltidspunktet.

Dette dækker kun personer der rent faktisk er inde i en event-kæde på måltidspunktet (en
tidstrigget rod er fyret, og kæden er endnu ikke afsluttet). Er ingen rod-node relevant endnu, eller
er kæden allerede afsluttet, falder personen tilbage til fri vandre-tilstand — se 13.4.

### 13.4 Fallback for frit vandrende beboere: tving en synlig ændring

Hvis resolve (13.3) viser at personen **ikke** er styret af en aktiv event-node ved måltidspunktet,
**og** personens `Activity` er en "roaming"-tilstand (`idle`/`walk`): teleportér (ikke gå) til en ny
tilfældig gyldig position, udelukkende så tidsspringet er synligt for brugeren — ellers kan et
30-minutters spring se ud som om intet skete. Genbrug samme mønster som andre teleports
(`NavGrid.NearestWalkable`, jf. `MoveAgent`).

### 13.5 Undtagelse: "parkerede" aktiviteter må aldrig flyttes

"Selvfølgelig ingen ny position hvis tilstanden er identisk i placering" — fx siddende ved
spisebordet, eller i seng og sover. Dette kræver en lille klassificering af hver `Activity`-værdi:

- **roaming**: `idle`, `walk` — må randomiseres af 13.4.
- **parked**: `sleeping`, `eating`, `tidying`, og fremtidige lignende tilstande — randomiseres
  **aldrig**, uanset om personen er inde i en aktiv event-node eller "bare" efterladt i tilstanden
  efter at en kæde er afsluttet. Deres position er semantisk bundet til aktiviteten (seng,
  spisebord) — at flytte dem ville være direkte forkert, ikke blot unødvendigt.

### 13.6 Afgrænsning: kun agent-tilstand, ikke verdens-objekter

Resolve dækker **kun** agentens position/`Activity` — **ikke** verdens-objekttilstande (åbne døre,
tændte lamper, `_lampLevels`, en opvaskemaskines åben/lukket-tilstand fra en `interact`-handling).
De forbliver upåvirket af et tidsspring, præcis som de er upåvirket af `JumpToTimeOfDay` i dag.
Bevidst afgrænsning — ikke overset.

### 13.7 Åbne spørgsmål

- Bevares "Spring til solopgang/solnedgang", og skal de i så fald route gennem resolve-mekanismen
  (13.3) i stedet for blot at kalde `JumpToTimeOfDay` som i dag?
- Hvad sker der med dags-instansbogføringen (afsnit 5) når en **tilbage**-forskydning krydser
  midnat? Simplest: lad `-30 min` ikke kunne krydse tilbage over midnat (clamp ved 00:00); en fuld
  løsning (genskabe gårsdagens instans) er ikke nødvendig for den oprindelige forespørgsel.
- Ny RPC: `ShiftTime(minutes)` (signeret, kan være negativ) — adskilt fra `JumpToTimeOfDay`, som
  forbliver absolut og fremad-kun til sine nuværende formål (hvis den bevares, jf. punkt 1 ovenfor).
