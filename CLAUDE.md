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
- Serveren bygges uden apphost (`UseAppHost=false`), fordi Windows blokerer den nybyggede exe.
