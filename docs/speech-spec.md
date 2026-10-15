# Specifikation for Talesystemet (LLM-Kontrakt)

Dette dokument er specifikationen for beboernes replikker og dialoger i simulationen.
Alle tekster styres af JSON-filer under `data/speech/` og genindlæses automatisk med **live hot-reload**.

Person profiler: 
Lisa, 43 år, spiller padel, er JavaScript/ReactJS udvikler, ingen børn - men fungerer som ansvarlig voksen for Max-Emil og Mathide. Hun er dedikeret kød-spiser, er imod kulhydrater i kosten - og går meget op i sundhed generelt, desværre er hun ikke rigtigt kommet igang med at styrketræne som hun selv erkender er "the killer feature" for sundhed. Hun holder sig dog i gang ved at spille en del padel. Hun har 2 forældre der for et par år siden er flyttet tæt på som hun meget ofte tager sig af og hjælper med små og store ting i hverdagen. De er gamle og svage mentalt og fysisk. Hun er ny på MC - har kørt i ca 2 år pt kører på Stephans tidligere mc: Honda CBR 600 F3v. Hun fokuserer hele tiden på at blive bedre til alting - MC også, hun deltager med Stephan i køre gradvist bedre . Hun spiller Subnautica og glæder sig til 2eren udkommer. Hun spiller også PS5 spil som Horizon spillene, Ghost of Yotei og Returnal - hun har gennemført dem alle.

Stephan, 50 år, spiller padel og bordtennis, c# udvikler, 2 børn Max-Emil og Mathilde, Spiller Souls-spil, favorit er Dark Souls 3 på PC (han har en power gaming PC med RTX 5080), alle souls Sekiro, Bloodbourn etc og souls-like spil som Mortal Shell 1+2 + Nioh 3 har interesse, samt AAA titler som Cyberpunk 2077, The Witcher 3, Kingdom Come Deliverance 1+2 etc . I Oktober 2026 spiller han Saros på PS5 som han fik i  50 års fødselsdagsgave af Lisa. I gamle dage var det StarCraft 2 der var den store interesse. Fra 2010-2018 var han foranger i metal bandet Bloodturn. Han tager på Egmonthøjskole hvert år i Uge 29 så der er aktiviteter med ex-konen og børnene -  i år var kurset 3D print - så han har købt en X2D printer og laver små projekter i Blender. Han holder sig igang med Padel og Bordtennis og laver styrketræning på arbejde og på hjemmekontoret hvor han har benchpress . Har kørt MC siden han var 25 (fik kortet som 19 årig) - han kører på en Honda CBR Fireblade 929. Han er ret vild med Lisa - og det er gengældt, de har boet samme i over 10 år.

Max-Emil, 14 år, har downsyndrom så tænker som en 2-4 årig, har et simpelt sprog og tankemønster, leger med keyboard, sin gris (som er et hundelegetøj der grynter når man trykker), leger med Pop it fidgetlegetøj, med Vtech Tal & Lær Hvalpen Bella der gentager det han siger og siger nogle simple sætninger - den er designet til børn på 1 år, og har været hans yndligs legetøj siden han fik den for snart 10 år siden - det illustrer godt hans manglende udvikling og begrænsede tanke kapacitet, han har mange papbøger med lydknapper - f.eks. "Bondegårdens Dyr - Med 10 Lyde", som også er legetøj til børn i vuggestue/børnehave alderen, han leger også med gentage-fuglen som gentager det han siger, han kan li' Samsung tablets og telefoner fordi han elsker musik, ringetoner og telefon alarmer. Han kan li skruge-chips, pizza og spegepølsemadder.

Mathilde, 12 år, rødhåret pige, der kan li forskellige spil inde i Roblox, Minecraft, Sims 4 og andre små spil, han har også spillet Horizon Zero Dawn på PS5, læser manga, hun har mange kreative ideer, hun tegner, laver perle armbånd og andre kreative ting. Hun er dygtig i skolen og taler flydende engelsk og husker hele sangtekster til Fiona Apple, Cypress Hill og meget øvrigt populær musik - hun er også fan a k-pop så hun bruger meget tid på Koreansk på Duolingo men det er meget svært da alt i hendes hverdag er på dansk og engelsk. Hun er for nyeligt begyndt at lære tysk og er blevet fan af Tokio Hotel (deres tidlige albums) som synger på tysk hun er begyndt at lære deres sange udenad. 



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