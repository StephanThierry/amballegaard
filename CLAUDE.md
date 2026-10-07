# Amballegaard

3D-isometrisk model af huset med autonome beboere. Se README.md for kørsel og struktur.

## Indsatte vektorer → flyt møbler

Brugeren tegner vektorer i appen (📐 Vektor / tasten V) og indsætter tekst som:

```
[Amballegaard vektor V1]
Fra: x=16.85, z=11.40 (Stue) — på møbel id="sofa" "Sofa" (nu pos=[16.75, 11.3], rot=90°)
Til: x=18.60, z=13.80 (Stue)
Vektor: Δx=+1.75, Δz=+2.40 m · længde 2.97 m · retning 36°
```

Sådan tolkes den:
- Møblet med det angivne `id` i `data/furniture.json` er det, der skal flyttes. Typisk sættes `pos` til `Til`-punktet
  (eller `pos + Δ`, hvis brugeren greb møblet langt fra dets centrum og mener en relativ flytning — spørg hvis tvivl).
- "retning" bruger samme konvention som `rot`: 0° = +z (nedad på plantegningen), 90° = +x. Siger brugeren
  "drej den så den vender sådan", sættes `rot` til retningen.
- Uden møbel-id er vektoren en position/retning til et nyt møbel, eller den henviser til de nævnte "nær"-møbler.
- Tjek at møblet ikke havner i en væg: vægge og rum står i `data/house.json` (koordinater = vægmidterlinjer;
  ydervægge 0,34 m tykke, indervægge 0,12 m). Brug møblets mål (se komponenterne i `web/src/three/Furniture.tsx`).
- Vite hot-reloader `data/furniture.json`, så ændringen ses straks i browseren.

## Konventioner

- Meter, x mod højre og z nedad på plantegningen, y op. Origo = garagens vestvæg / nordligste facade.
- Simulationen er server-autoritativ (`src/Amballegaard.Simulation`); klienten tegner kun.
- `dotnet test` dækker husmodel, drag/drop, talebobler og porte. Kør den efter ændringer i data/house.json.
- Serveren bygges uden apphost (`UseAppHost=false`), fordi Windows blokerer den nybyggede exe.
