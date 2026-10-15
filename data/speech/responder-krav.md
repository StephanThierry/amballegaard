# Kravspecifikation: `responder` i samtaler

## Baggrund
I `conversations.json` vælges i dag kun den person, der siger `starter`, via filtrene `speaker`/`speakers`. Den, der svarer, vælges tilfældigt blandt personerne i rummet. Det giver forkerte situationer, fx når Max-Emil svarer "Lige når jeg er færdig med Saros", eller når Mathilde svarer på en replik, der er ment til Lisa.

Dataene i `conversations.json` bruger allerede de nye felter (indsat 15.10.2026). Koden skal nu understøtte dem.

## 1. Nye felter

| Felt | Type | Beskrivelse | Eksempel |
|---|---|---|---|
| `responder` | Streng | Hvem der må svare: en klasse (`Anyone`, `Adult`, `Child`) eller et person-ID fra `events/index.json` | `"lisa"`, `"Adult"` |
| `responders` | Liste | Flere tilladte svarere. Klasser og person-ID'er må blandes | `["stephan", "lisa", "mathilde"]` |

Felterne er valgfrie og virker præcis som `speaker`/`speakers`. Den samme matcher-funktion bør bruges til begge.

## 2. Matchning
1. Klassen sammenlignes med `kind` i `index.json` (`Adult`, `Child`, `Dog`). `Anyone` matcher alle personer, dog ikke `Dog`. Det følger reglen for `speaker`.
2. Et person-ID sammenlignes med `persons[].id`, og der skelnes ikke mellem store og små bogstaver.
3. Hvis både `responder` og `responders` er sat, gælder foreningsmængden af dem.
4. Hvis ingen af felterne er sat, er standarden `Anyone`. Så virker eksisterende data uændret.
5. Den person, der sagde `starter`, kan aldrig være svarer, heller ikke selvom hun eller han matcher filteret.

## 3. Valg af samtale
- En samtale må kun startes, hvis der **i samme rum** står mindst én person, der matcher `responder`/`responders`. Personen må ikke være optaget af en aktivitet, der blokerer tale (fx `sleeping`).
- Er der flere mulige svarere, vælges én tilfældigt.
- Kan ingen samtale opfylde både speaker-, responder- og rumfiltrene, falder systemet tilbage til `ambient`, ligesom i dag.
- `notWhile` gælder også for svareren.

## 4. Validering ved hot-reload
- Ukendte person-ID'er eller klasser i `responder`/`responders` giver en advarsel i loggen med filnavn og `starter`-teksten. Indlæsningen må ikke fejle.
- Hvis en samtale har `responder` lig med `speaker`, og begge er det samme person-ID, giver det en advarsel, fordi samtalen aldrig kan afspilles.
- En tom liste i `responders` behandles som om feltet ikke er sat, og der skrives en advarsel.

## 5. Samme behov i andre filer (anbefaling)
De nye replikker i `appliances.json` og `reactions.json` bruger person-ID'er i `speaker` (fx `"maxemil"`, `"lisa"`). Spec'en nævner kun person-ID'er for `ambient` og `conversations`. Det skal sikres, at den fælles speaker-matcher også bruges i:
- `appliances.json` (`pointKind` + `speaker`)
- `reactions.json` (`trigger` + `speaker`)

## 6. Accepttest
| # | Opsætning | Forventet |
|---|---|---|
| 1 | Stephan og Max-Emil i stuen. Samtale med `speaker: stephan`, `responder: lisa` | Samtalen vælges ikke |
| 2 | Stephan og Lisa i køkkenet, samme samtale | Stephan starter, og Lisa svarer |
| 3 | Lisa, Mathilde og Max-Emil. `speaker: Adult`, `responders: [stephan, lisa, mathilde]` | Lisa starter, og Mathilde svarer. Max-Emil svarer aldrig |
| 4 | Samtale uden responder-felter | Opfører sig som før |
| 5 | `responder: "Lisa"` (stort L) | Matcher lisa |
| 6 | `responder: "bente"` (ukendt) | Advarsel i loggen, og samtalen springes over |
| 7 | Max-Emil i rummet, appliance-replik `speaker: maxemil` ved `fridge` | Replikken kan vælges for Max-Emil og ingen andre |

## 7. Spec-opdatering
Når koden er rettet, tilføjes `responder` og `responders` til tabellen i afsnit 2 i speech-spec'en med en note om, at de kun gælder `conversations.json`.
