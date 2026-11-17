# Mapping-Tool-Architektur
Ein Tool entwickeln, das Lagepläne, Schwarzpläne, 3D-Gebäude daten, Straßen und Grünflächen/Vegetation automatisch erfasst, übersichtlich darstellt und Zusammenfasst

## Stand
2D-Pläne aus OpenStreetMap funktionieren: Rechteck auf der Karte aufziehen, „Analysieren“ klicken,
dann erscheinen Schwarzplan, Straßennetz, Grün, Lageplan und eine Kennzahlen-Tafel (GRZ/GFZ brutto
und netto, Grünanteil, Straßenlängen, Nutzungen). Der Knopf „Beispiel Oldenburg laden“ nutzt
eingebaute OSM-Daten der Oldenburger Innenstadt (`data/beispiel-oldenburg-osm.js`) und zeigt
dazu ein 3D-Modell mit den amtlichen LoD2-Gebäuden (echte Dachformen) und Bäumen. Im Lageplan
erscheinen die Dächer als schattierte Dachaufsicht, Straßen als Flächen mit Rand.
Eigene Daten lassen sich per Drag & Drop importieren: amtliche LoD2-Kacheln (CityGML, auch als ZIP)
und topoexport-Dateien (DXF, auch als ZIP). Das Tool zeigt an, welche Kacheln für das Gebiet nötig
sind, verortet topoexport automatisch und nutzt amtliche Höhen und Gebäudefunktionen für die Kennzahlen.
Diagramme und Export folgen.

**Ausprobieren:** Die Seite über einen kleinen lokalen Webserver öffnen, z. B. im Projektordner
`python -m http.server` ausführen und dann http://localhost:8000 im Browser öffnen.

**Quellen:** Kartendaten © OpenStreetMap-Mitwirkende, Lizenz ODbL
(https://www.openstreetmap.org/copyright), abgefragt über die Overpass-API.
3D-Gebäude: Landesamt für Geoinformation und Landesvermessung Niedersachsen (LGLN),
3D-Gebäudemodell LoD2, Lizenz CC BY 4.0. Gelände DGM1, Flurstücke und tatsächliche Nutzung (ALKIS):
LGLN, CC BY 4.0 bzw. Geobasis NRW (dl-de/zero-2-0). Bodenrichtwerte: Gutachterausschüsse für
Grundstückswerte Niedersachsen, BORIS-NI (dl-de/by-2-0). Wohnen (Nettokaltmiete, Leerstand, Wohnfläche,
Eigentümerquote, Baujahr): Statistische Ämter des Bundes und der Länder, Zensus 2022, 100-m-Gitter (dl-de/by-2-0),
teils abgerufen über die destatis-Seite „Mietvergleich“ (Miete nach Baualter und Wohnungsgröße).
Bibliotheken: MapLibre GL JS, Turf, osmtogeojson, proj4, three.js, JSZip, geotiff.js.
Piktogramme im Reiter „Infrastruktur“: Maki von Mapbox (https://github.com/mapbox/maki), Lizenz CC0.

- [`PLAN.md`](PLAN.md): Umsetzungsplan (Ziel, Must/Should/Could, Datenquellen, Export, Reihenfolge, Risiken)
- [`UEBERGABE.md`](UEBERGABE.md): Zusammenfassung der bisherigen Sitzung für die Weiterarbeit in einem neuen Chat
- [`CLAUDE.md`](CLAUDE.md): Regeln und technische Festlegungen für die Zusammenarbeit mit dem Coding-Agenten

Die vollständige README mit Anleitung folgt, wenn das Tool fertig ist.
