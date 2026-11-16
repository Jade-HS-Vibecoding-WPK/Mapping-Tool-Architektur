# Ziel
Web-Tool „Ortsanalyse“ für Architekturstudierende: Gebiet auf der Karte wählen und automatisch
Schwarzplan, Straßennetz, Grün/Vegetation, Lageplan, 3D-Modell, Kennzahlen, Diagramme und Export
bekommen. Details und aktueller Stand: siehe PLAN.md.

# Regeln
- Die Nutzerin / der Nutzer studiert Architektur und kann nicht programmieren: jeden Schritt einfach
  auf Deutsch erklären, Fachbegriffe kurz übersetzen.
- Erst fragen, dann bauen. Ein Feature pro Sitzung, klein halten.
- Am Ende jeder Sitzung den Stand in PLAN.md (Abschnitt 8) eintragen.
- Keine API-Keys im Code oder auf GitHub. Keys nur in .env (die nicht hochgeladen wird).
- Keine personenbezogenen Daten.
- Quellenangabe „© OpenStreetMap-Mitwirkende (ODbL)“ immer sichtbar, auch in Exporten.

# Technik
- Reine Website (HTML, CSS, JavaScript), läuft auf GitHub Pages, kein eigener Server.
- Bibliotheken per CDN: MapLibre GL JS (Karte, 3D), Turf.js (Flächen/Längen), Chart.js (Diagramme),
  osmtogeojson (OSM-Rohdaten in Flächen und Linien umwandeln), proj4 (UTM 32 ↔ Längen/Breitengrad).
- Amtliche Straßen-/Wegflächen (ALKIS: AX_Strassenverkehr, AX_Weg, AX_Platz) kommen automatisch per WFS vom LGLN
  (https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_sf). Fahrbahn und Gehweg sind dort getrennt.
- LoD2 wird automatisch vom LGLN geladen: Kacheln per STAC-Suche (https://lod.stac.lgln.niedersachsen.de/search),
  Einlesen im Hintergrundprogramm `lod2-worker.js`. Quellenvermerk „© GeoBasis-DE/LGLN <Jahr>, Daten geändert“.
- Daten: OpenStreetMap über die Overpass-API. Gebiet maximal ca. 1 km².
- Zusatzdaten per Datei-Import (z. B. topoexport, amtliche LoD2-Modelle Niedersachsen).
- topoexport-DXF: binär, AC1024, Meter, LOKALE Koordinaten (Nullpunkt unten links, keine Georeferenz),
  Layer mit Präfix TPX_ (Zuordnung siehe PLAN.md 4b-2). „H 6.0 m“-Texte sind Platzhalter, nie als
  Höhe verwenden. Z-Werte 0,00–0,05 sind nur Zeichenreihenfolge.
- topoexport-3D-DXF: gleicher Rahmen/Nullpunkt wie 2D, echte Höhen (ca. NHN), Gebäude = LoD2 als MESH
  (Dreiecke, keine Attribute, mehrere Teile pro Gebäude), Gelände-MESH (~20 m Raster), 3D-Bäume als
  Blöcke. Wand/Dach über Flächenneigung trennen; Teile per Grundriss (ALKIS aus 2D) Gebäuden zuordnen.
- Quellenangabe: LGLN Niedersachsen (CC BY 4.0), Overture Maps (ODbL), Meta/WRI (CC BY 4.0),
  © OpenStreetMap-Mitwirkende (ODbL), Hinweis „nicht vermessungsgenau“.
- CityGML (LGLN): CityGML 1.0 AdV-Profil, 1×1-km-Kacheln `LoD2_32_<E-km>_<N-km>_1_ni.gml`,
  EPSG:25832 + DHHN2016 (NHN), ~57 MB/Kachel. Building + BuildingPart, Wall/Roof/Ground/ClosureSurface,
  bldg:function (ALKIS-Code), roofType, measuredHeight, gen-Attribute (Firsthoehe, MittlereTraufHoehe,
  AbsoluteHoehe, DachtypName …). Keine Geschosszahl. Mehrere Kacheln pro Gebiet zusammenführen.
- Testdaten-Lage: topoexport-Nullpunkt = UTM32 E 446885.3 / N 5887643.7 (per Gebäudeabgleich ermittelt).
  Testgebiet E 446885–447897, N 5887644–5888653. Vorhandene LoD2-Kacheln: 447_5888, 447_5887
  (+ 448_5887, 448_5888 außerhalb). Fehlend: 446_5887, 446_5888 (Westrand, Ersatz topoexport-3D).
- Gebäude quellenübergreifend über Flächenüberlappung (> 50 %) zuordnen, nicht über Mittelpunkte.
- Import-Formate: DXF, DWG, CityGML. DWG zuletzt; falls nicht lesbar, Anleitung zur Umwandlung in DXF.
- Koordinaten: Standard ETRS89 / UTM 32 (EPSG:25832), mit proj4 umrechnen.
- Export: PNG (Bilder) und DXF für CAD (Layer pro Kategorie, 1 Einheit = 1 m, UTM 32 oder lokaler
  Nullpunkt, Quellenangabe als Text im Layer BESCHRIFTUNG).
- DXF-Export enthält ALLE 3D-Daten: Gebäude als 3D-Wand- und Dachflächen (3DFACE/MESH), LoD2 1:1,
  Z-Werte aus Importen nie verwerfen, Ersatz-Gebäude auf eigenem Layer.
- CAD-Zielprogramme: Allplan 2024 und ArchiCAD 29. Je eine Export-Voreinstellung (DXF AutoCAD 2013, Meter;
  Allplan: UTM 32; ArchiCAD: lokaler Nullpunkt + Bezugskoordinaten als Text). Layernamen ohne
  Umlaute/Leerzeichen. Tests in beiden Programmen macht die Nutzerin / der Nutzer (Screenshots).
- Gebäude möglichst als LoD2; Ersatz: LoD1, dann OSM-Grundriss × Geschosse.
- Lageplan: pro Ebene und pro Gebäude die detaillierteste vorhandene Quelle nehmen und die Quelle anzeigen.
- 3D mit LoD2-Dächern: three.js.
- Testgebiet: Oldenburg Innenstadt.

# Fachliche Festlegungen
- Kennzahlen GRZ/GFZ des Quartiers immer brutto (Gebiet) UND netto (ohne Straße, Bahn, Grün, Wasser).
- Nebengebäude/Überdachungen (ALKIS 51009_…) = eigene Kategorie: grau, getrennt gezählt, ausblendbar.
- Bild-Export maßstäblich (1:1000/2000/5000, A4–A0, 300 dpi).
- Demo-Daten Oldenburg fest eingebaut (Knopf „Beispiel Oldenburg laden“), mit Quellenangabe.

# Gestaltung
- Klassisch-architektonisch: Schwarz-Weiß, feine Linien, eine Akzentfarbe, viel Weißraum.
- Pläne immer mit Nordpfeil und Maßstabsleiste.
- Ein Hauptbutton pro Ansicht („Analysieren“).
