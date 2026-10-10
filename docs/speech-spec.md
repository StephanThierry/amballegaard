# Specifikation for Talesystemet (LLM-Kontrakt)

Dette dokument er specifikationen for beboernes replikker og dialoger i simulationen.
Alle tekster styres af JSON-filer under `data/speech/` og genindlæses automatisk med **live hot-reload**.

---

## 1. Filer i `data/speech/`

1. **`ambient.json`** – Spontane soloudbrud i hverdagen.
2. **`conversations.json`** – Dialoger mellem 2 personer i samme rum (starter + svarmuligheder).
3. **`appliances.json`** – Replikker ved apparater (`fridge`, `freezer`, `dishwasher`, `stove` osv.).
4. **`reactions.json`** – Reaktioner på muse-klik (`pickedUp`, `arrivalKiss`).
5. **`love.json`** – Stephan & Lisas kærlighedsmanuskripter (`LoveScripts`).

---

## 2. Filtreringsfelter

Enhver replik i `ambient.json` og `conversations.json` kan bruge følgende valgfrie felter:

| Felt | Type | Beskrivelse | Eksempel |
|---|---|---|---|
| `speaker` | Streng | Hvem der kan sige det (`Anyone`, `Adult`, `Child` eller ID fra `index.json`) | `"stephan"`, `"Adult"` |
| `speakers` | Liste | Flere tilladte personer | `["stephan", "lisa"]` |
| `rooms` | Liste | Eksplicit hvidliste over rum-ID'er | `["kitchen_family_room"]` |
| `excludeRooms` | Liste | **Negativ liste**: må IKKE siges her | `["garage", "technical_room"]` |
| `requiresApplianceInRoom` | Streng | Kræver bestemt udstyr i rummet | `"tv"`, `"fireplace"`, `"dishwasher"` |
| `timeRange` | Objekt | `{ "from": "HH:mm", "to": "HH:mm" }` | `{ "from": "17:00", "to": "22:00" }` |
| `notWhile` | Liste | Må ikke siges under disse aktiviteter | `["sleeping", "eating"]` |

---

## 3. Eksempler

### A. Rum med TV (`requiresApplianceInRoom: "tv"`)
```json
{
  "text": "Har nogen set fjernbetjeningen?",
  "speaker": "Anyone",
  "requiresApplianceInRoom": "tv",
  "timeRange": { "from": "16:00", "to": "23:00" }
}