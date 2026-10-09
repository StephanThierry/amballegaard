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
  `house.json`/familien.
- To `trigger: time`-noder for samme person på samme klokkeslæt er formentlig en fejl — bør flages.
- Hvert event-node-dokument bør bære et `schemaVersion`-felt, så motoren kan afvise filer skrevet
  mod en forældet spec i stedet for at mistolke dem stille.

## 9. `.md`-spec til LLM-forfatning (separat fil — skal skrives når motoren findes)

Denne plan er arkitekturen. Selve kontrakten en fremtidig LLM-session skriver nye event-filer ud
fra, skal være en separat, udtømmende fil (fx `docs/dagsplan-events-spec.md`), der mindst
indeholder:

- Fil-placering/navngivning, og `schemaVersion`.
- Det fulde handlingsvokabular (afsnit 4) med felter og gyldige værdier.
- Adresseringsnøglen `(person, id)` og hvordan `oncomplete`/`waitFor` bruges.
- Hvilke rum-/person-/punkt-/appliance-id'er der findes (pointer til at slå op i `house.json`),
  inkl. advarsel om pladstrængsel i små rum (`badN`).
- 2-3 fuldt udfoldede eksempelfiler som skabelon (se afsnit 10).
- Eksplicit: ingen tvungen kæde-gennemførsel (afsnit 6), ingen implicit gentagelse uden om `chore`
  (afsnit 4), `setState` er øjeblikkelig.
- En konkret verifikationskommando en LLM skal køre efter at have tilføjet/ændret en fil (del af
  `dotnet test`, eller en dedikeret valideringsrute), jf. CLAUDE.md's regel om at køre `dotnet test`
  efter ændringer i `house.json`.

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

1. `EventNode`-model + loader (mappe-scan af `data/events/*.json`, hot-reload, validering jf.
   afsnit 8) — ingen ny agent-adfærd endnu, bare data ind og valideret.
2. Klokkeslæt-trigger (krydsningstjek, daglig rearming, robust over for `TimeScale`/`Paused`/
   `JumpToTimeOfDay`) som selvstændig, testet byggesten.
3. Generisk node-afvikling for `goto`/`speak`/`wait`/`setState` (dækker `wakeup`, som er simplere:
   ét samlingspunkt i køkkenet, intet pladsproblem).
4. Udvid med `interact`/`chore` (dækker opvaskemaskine-eksemplet og lignende huslige gøremål).
5. Implementér `tobed` fuldt ud (sværere: forgrenet børn/voksne-logik, lille badeværelse,
   efterfølgende søvntilstand til variabelt vågn-tidspunkt).
6. Skriv `docs/dagsplan-events-spec.md` (afsnit 9) sideløbende med trin 1-5 — specen *er* kontrakten
   for loaderen, så de skal udvikles sammen, ikke specen bagefter.
7. Klient-animationer/poser for de nye `Activity`-værdier (`sleeping`, `tidying`, …) kan komme
   sidst — kan vises som stillestående i den rigtige position/pose, indtil riggede avatarer
   (sidste del af Fase 4, jf. README) er klar.
8. Test-strategi, jf. eksisterende `dotnet test`-mønster (husmodel, drag/drop, porte, talebobler):
   dæk (a) at et event udløses præcis én gang/dag, også ved høj `TimeScale` og efter
   `JumpToTimeOfDay`, (b) at alle deltagere ender rigtigt sted med rigtig `Activity`, (c) at en
   bruger-afbrydelse (drag/`SetActive`) midt i et event rydder op uden at nogen sidder fast.
