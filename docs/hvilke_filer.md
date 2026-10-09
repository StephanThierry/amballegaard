Her er en prioriteret liste, opdelt efter hvor nødvendig filen er for trin 2-10 (afsnit 12 i planen). Da en chat LLM'en ikke selv kan udforske mappen, skal den have selve indholdet af disse filer indsat i konteksten, ikke bare stierne.

A. Selve kontrakten (skal med, uanset hvilket trin)

- docs/dagsplan-motor.md — hele planen: datamodel, handlingsvokabular, afbrydelsesregler, implementeringsrækkefølgen selv. Uden denne giver resten af filerne ingen mening.
- CLAUDE.md — projektkonventioner (hot-reload vs. genstart, test-krav, commit-stil, pointeren til docs/3d-noter.md).

B. Simulationens kernekode (det der skal bygges videre på, trin 2-6)

- src/Amballegaard.Simulation/World.cs — den vigtigste. StepLove er mønsteret der skal generaliseres, StartPath/ClearPath/UpdateHeldDoors/PlanIndoorWalk er de byggeklodser en goto/interact/chore-afvikler skal genbruge, og Tick() er hvor den nye trigger-logik skal hægtes på.
- src/Amballegaard.Simulation/Agents/Agent.cs — feltstrukturen (Activity, WanderRoomId, InLoveMeeting-mønsteret) som den nye "er-i-en-kæde"-tilstand skal ligne.
- src/Amballegaard.Simulation/Agents/Family.cs — de 5 beboeres id'er og HomeRoomId (nu med de nye navne).
- src/Amballegaard.Simulation/Agents/Speech.cs — SpeechLine/Say()-mekanikken som speak-handlingen skal genbruge.
- src/Amballegaard.Simulation/House/HouseModel.cs — RoomDef/ApplianceDef/OpeningDef: det loaderen skal validere goto/interact-mål imod.
- src/Amballegaard.Simulation/House/NavGrid.cs — FindPath/DoorsOnPath/NearestWalkable, nødvendig for at implementere goto og senere resolve-mekanismens geometriske varighedsberegning (afsnit 13.3).
- src/Amballegaard.Simulation/Events/EventIndex.cs — trin 1, allerede lavet; viser mønsteret for hvordan ID-indekset er struktureret.

C. Data (den konkrete virkelighed, ikke kun modellen)

- data/events/index.json — selve ID-indekset. Dette er typisk vigtigere end house.json for denne opgave, fordi det er curated præcis til formålet (gyldige rum/personer/punkter uden geometri-støj).
- data/house.json — kun nødvendig hvis LLM'en selv skal ræsonnere om rumgeometri/afstande (ellers dækker indekset + HouseModel.cs'ens API det meste).

D. Server-hosting (kun relevant for trin 2 og trin 10)

- src/Amballegaard.Server/Program.cs — DI-opsætning, hvor loaderen/hot-reload skal initialiseres, og hvor EventIndexWriter allerede kaldes.
- src/Amballegaard.Server/WorldHub.cs — mønsteret for eksisterende SignalR-RPC'er (ToggleDoor, JumpToTimeOfDay), som en ny ShiftTime-RPC (trin 10) skal følge.
- Bemærkning at give LLM'en direkte: planens afsnit 7 sammenligner hot-reload med furniture.json, men den sammenligning er vildledende — furniture.json hot-reloades af Vite på klientsiden (det er et JS-import), mens data/events/*.json skal læses af C#-backenden. Det kræver en helt anden mekanisme (fx FileSystemWatcher), ikke genbrug af Vite. Værd at nævne eksplicit, så den nye session ikke går i den fælde.

E. Tests (konvention at følge, trin 9)

- tests/Amballegaard.Simulation.Tests/HouseModelTests.cs — eksisterende test-stil og HousePath-opløsningsmønster.
- tests/Amballegaard.Simulation.Tests/EventIndexTests.cs — lille, viser mønsteret for trin 1's tests.

F. Kun nødvendig for trin 8 og 10 (klient)

- docs/3d-noter.md — CLAUDE.md kræver eksplicit at denne læses før ændringer i web/src/three.
- web/src/ui/Hud.tsx — tidspanelet der skal ændres (trin 10).
- web/src/store.ts — RPC-wrapper-mønsteret (setTimeScale, jumpToTimeOfDay) som shiftTime skal følge.
- web/src/three/Avatars.tsx — hvordan Activity i dag konsumeres/vises, relevant for nye poser (trin 8).

Ikke nødvendigt at give med: web/src/three/Furniture.tsx (3100+ linjer, kun relevant hvis man rent faktisk tegner nye møbel-geometri), data/furniture.json i fuld længde (kun uddrag hvis en bestemt beboers "parkerede" position skal findes), og web/src/three/show.ts/textures.ts (urelateret til dagsplan-motoren).