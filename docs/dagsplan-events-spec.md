# Specifikation for Dagsplan-Events (LLM-Kontrakt)

> **Formål:** Denne fil er den udtømmende reference og kontrakt for forfatning af dagsplan-filer (`data/events/<person>.json`). 
> En LLM behøver **kun** at læse dette dokument samt `data/events/index.json` for at forfatte gyldige events til simulationen.

---

## 1. Grundregler og Metodologi

Når du som LLM skal forfatte eller udvide en beboers dagsplan:

1. **Brug KUN ID'er fra `data/events/index.json`:**
   * Opfind **aldrig** egne id'er til rum, personer eller apparater/punkter.
   * Hvis et apparat (fx et skab) ikke findes i `index.json`, må det **ikke** refereres i et event.
2. **Én fil pr. person:**
   * Alle noder en person *udfører*, placeres i personens egen fil: `data/events/<person>.json`.
   * En person kan godt udløse handlinger for andre via `oncomplete`, men handlingen skal ejes af den person, der fysisk gør det.
3. **Ingen cykler:** Grafen skal være cyklefri inden for én dags kørsel.
4. **Ingen orphans:** Enhver node med `"trigger": { "type": "passive" }` **skal** være mål for mindst ét `oncomplete` eller `waitFor` et sted i filmængden.
5. **Ingen tids-kollisioner:** Samme person må ikke have to `time`-triggere på nøjagtig samme klokkeslæt.
6. **Kæder kan knække (ikke-kritisk simulation):** 
   * Hvis brugeren trækker i en avatar med musen eller slår personen fra midt i en kæde, afbrydes personens deltagelse øjeblikkeligt. 
   * Design derfor ikke events med antagelse om "garanteret levering mod katastrofe". Næste dag starter frisk igen.

---

## 2. Filstruktur og Node-format

En event-fil kan enten være en rå JSON-liste eller en envelope med `schemaVersion`:

```json
{
  "schemaVersion": 1,
  "person": "lisa",
  "events": [
    {
      "id": "OPVASK_1",
      "trigger": { "type": "time", "value": "08:00" },
      "action": { "type": "goto", "target": { "kind": "point", "value": "dishwasher" } },
      "chain": "opvask",
      "oncomplete": [ { "person": "lisa", "id": "OPVASK_2" } ]
    }
  ]
}
```

### Felter i en `EventNode`:
* `id` *(påkrævet, streng eller tal)*: Unikt id inden for personens fil (fx `"WAKE_1"`, `"TOBED_S2"`).
* `trigger` *(påkrævet)*:
  * `{ "type": "time", "value": "07:30" }`: Rod-indgangspunkt. Fyrer automatisk én gang i døgnet, når simulationens ur krydser tidspunktet. Rearmes ved midnat.
  * `{ "type": "passive" }`: Fyrer **kun** når en anden node peger på den via `oncomplete`.
* `action` *(påkrævet)*: Handlingen der skal udføres (se afsnit 3).
* `oncomplete` *(valgfri, liste)*: Noder der skal startes, når denne handling er fuldført: `[ { "person": "stephan", "id": "..." } ]`. Kan frit pege på andre personer.
* `waitFor` *(valgfri, liste)*: **Fan-in / Join**. Noden starter først, når **alle** refererede noder i listen er markeret færdige den pågældende dag.
* `duration` *(valgfri)*: `{ "min": 5, "max": 10 }` i sekunder.
* `chain` *(valgfri)*: Kosmetisk navn til debugging/UI (fx `"tobed"`, `"wakeup"`, `"opvask"`).

---

## 3. Handlingsvokabular (`action.type`)

| `action.type` | Nødvendige felter | Færdig hvornår? | Bemærkninger |
|---|---|---|---|
| `goto` | `target: { kind, value }` | Ankommet til mål | `kind` kan være `"room"`, `"point"` eller `"person"`. |
| `speak` | `text: "..."` | Replikkens varighed udløbet | Viser taleboble over avataren. |
| `wait` | `seconds: 5.0` | Tiden er gået | Avataren står stille i `idle`. |
| `setState` | `activity: "sleeping"` | **Øjeblikkelig (0 sek)** | Skifter avatarens tilstand og fyrer straks `oncomplete`. |
| `interact` | `target: "...", state: "open"\|"closed"` | **Øjeblikkelig (0 sek)** | Åbner/lukker et apparat eller dør fra `index.json`. |
| `chore` | `points: [...], activity, duration` | Varigheden er udløbet | Pendler frem og tilbage mellem punkterne med arbejdspauser. |

### Særlige regler for handlinger:
* **`goto` mål:**
  * `kind: "room"`: Beboeren finder automatisk vej til rummet via NavGrid og stopper nær centrum.
  * `kind: "point"`: Beboeren går til apparatets `standAt`-punkt (fx `"dishwasher"`).
  * `kind: "person"`: **Dynamisk!** Hvis målet bevæger sig, replanlægges ruten. Handlingen fuldføres, når aktøren er i samme rum og højst 1,0 meter fra målet.
* **`setState` er øjeblikkelig:**
  * En tilstand som `"sleeping"` eller `"eating"` varer ikke fordi noden "kører", men fordi der ikke er noget `oncomplete`, og avataren efterlades i tilstanden, indtil en fremtidig kæde rører den.
* **`interact`:**
  * Kalder samme tilstand som brugerens klik i 3D-visningen (`openDoors`). 
  * `target` kan skrives enten som streng `"target": "dishwasher"` eller objekt `{ "kind": "point", "value": "dishwasher" }`.
* **`chore`:**
  * Bruges til huslige opgaver (tømme opvasker, rydde op). Undgår at skrive mange gentagne `goto`-skridt.

---

## 4. Standardmønstre og Eksempler

### Mønster 1: Vækning af andre (`wakeup`)
*Forælderen går ind på barnets værelse, taler, og trigger barnets opvågning via `oncomplete`:*

**I `lisa.json`:**
```json
{
  "id": "WAKE_L1",
  "trigger": { "type": "time", "value": "07:05" },
  "action": { "type": "goto", "target": { "kind": "room", "value": "maxemils_bedroom" } },
  "oncomplete": [ { "person": "lisa", "id": "WAKE_L2" } ]
},
{
  "id": "WAKE_L2",
  "trigger": { "type": "passive" },
  "action": { "type": "speak", "text": "Godmorgen Max-Emil! Op og spise morgenmad." },
  "oncomplete": [
    { "person": "maxemil", "id": "MAX_WAKE_1" },
    { "person": "lisa", "id": "WAKE_L3" }
  ]
}
```

**I `maxemil.json`:**
```json
{
  "id": "MAX_WAKE_1",
  "trigger": { "type": "passive" },
  "action": { "type": "setState", "activity": "idle" },
  "oncomplete": [ { "person": "maxemil", "id": "MAX_WAKE_2" } ]
},
{
  "id": "MAX_WAKE_2",
  "trigger": { "type": "passive" },
  "action": { "type": "goto", "target": { "kind": "room", "value": "kitchen_family_room" } },
  "oncomplete": [ { "person": "maxemil", "id": "MAX_WAKE_3" } ]
},
{
  "id": "MAX_WAKE_3",
  "trigger": { "type": "passive" },
  "action": { "type": "setState", "activity": "eating" },
  "oncomplete": []
}
```

### Mønster 2: Husligt arbejde (`interact` + `chore`)

**I `lisa.json`:**
```json
{
  "id": "OPVASK_1",
  "trigger": { "type": "time", "value": "08:00" },
  "action": { "type": "goto", "target": { "kind": "point", "value": "dishwasher" } },
  "oncomplete": [ { "person": "lisa", "id": "OPVASK_2" } ]
},
{
  "id": "OPVASK_2",
  "trigger": { "type": "passive" },
  "action": { "type": "interact", "target": "dishwasher", "state": "open" },
  "oncomplete": [ { "person": "lisa", "id": "OPVASK_3" } ]
},
{
  "id": "OPVASK_3",
  "trigger": { "type": "passive" },
  "action": {
    "type": "chore",
    "points": [ "dishwasher", "kitchen_tap" ],
    "activity": "tidying",
    "duration": { "min": 25, "max": 40 }
  },
  "oncomplete": [ { "person": "lisa", "id": "OPVASK_4" } ]
},
{
  "id": "OPVASK_4",
  "trigger": { "type": "passive" },
  "action": { "type": "interact", "target": "dishwasher", "state": "closed" },
  "oncomplete": []
}
```

### Mønster 3: Fælles samling via `waitFor` (Fan-in)
*Morgenmaden serveres først, når både Stephan og Lisa er ankommet til køkkenet:*

```json
{
  "id": "BREAKFAST_TOGETHER",
  "trigger": { "type": "passive" },
  "action": { "type": "speak", "text": "Velbekomme allesammen!" },
  "waitFor": [
    { "person": "stephan", "id": "ARRIVED_KITCHEN" },
    { "person": "lisa", "id": "ARRIVED_KITCHEN" }
  ],
  "oncomplete": []
}
```

---

## 5. Validering

Når filer er oprettet eller ændret, valideres de automatisk af serveren ved opstart og hot-reload.
Du kan altid køre:

```bash
dotnet test
```

Dette scanner alle `.json`-filer i `data/events/` og rapporterer øjeblikkeligt eventuelle stavefejl i ID'er, manglende targets, cykler eller forældreløse (orphan) noder.
