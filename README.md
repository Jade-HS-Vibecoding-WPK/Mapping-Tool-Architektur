# Mapping-Tool-Architektur
Ein Tool entwickeln, das Lagepläne, Schwarzpläne, 3D-Gebäude daten, Straßen und Grünflächen/Vegetation automatisch erfasst, übersichtlich darstellt und Zusammenfasst

## Stand
2D-Pläne aus OpenStreetMap funktionieren: Rechteck auf der Karte aufziehen, „Analysieren“ klicken,
dann erscheinen Schwarzplan, Straßennetz, Grün, Lageplan und eine Kennzahlen-Tafel (GRZ/GFZ brutto
und netto, Grünanteil, Straßenlängen, Nutzungen). Der Knopf „Beispiel Oldenburg laden“ nutzt
eingebaute OSM-Daten der Oldenburger Innenstadt (`data/beispiel-oldenburg-osm.js`).
3D-Modell, Datei-Import und Export folgen.

**Ausprobieren:** Die Seite über einen kleinen lokalen Webserver öffnen, z. B. im Projektordner
`python -m http.server` ausführen und dann http://localhost:8000 im Browser öffnen.

**Quellen:** Kartendaten © OpenStreetMap-Mitwirkende, Lizenz ODbL
(https://www.openstreetmap.org/copyright), abgefragt über die Overpass-API.

- [`PLAN.md`](PLAN.md): Umsetzungsplan (Ziel, Must/Should/Could, Datenquellen, Export, Reihenfolge, Risiken)
- [`UEBERGABE.md`](UEBERGABE.md): Zusammenfassung der bisherigen Sitzung für die Weiterarbeit in einem neuen Chat
- [`CLAUDE.md`](CLAUDE.md): Regeln und technische Festlegungen für die Zusammenarbeit mit dem Coding-Agenten

Die vollständige README mit Anleitung folgt, wenn das Tool fertig ist.
