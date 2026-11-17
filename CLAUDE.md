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
- Bibliotheken per CDN: MapLibre GL JS (Karte, 3D), Turf.js (Flächen/Längen), Chart.js (Diagramme).
- Daten: OpenStreetMap über die Overpass-API. Gebiet maximal ca. 1 km² (Grenze im Code: 1,1 km²).
  Umwandlung in GeoJSON mit osmtogeojson. Code-Aufteilung: `app.js` (Karte, Gebiet, Reiter, Ablauf),
  `osm.js` (Laden, Kategorien), `plaene.js` (2D-Pläne), `kennzahlen.js`, `lod2.js` (LoD2-Daten, proj4,
  Dachschattierung), `dreid.js` (3D mit three.js 0.147). Eingebaute Daten des Testgebiets:
  `data/beispiel-oldenburg-osm.js`, `data/beispiel-oldenburg-lod2.js` (erzeugt mit `werkzeuge/lod2_beispiel.py`,
  danach ergänzt mit `werkzeuge/topoexport_beispiel.py`) und `data/beispiel-oldenburg-strassen.js`.
- Richtige topoexport-Daten = Inhalt von `topoexport-D8F988.zip`. Die losen DXF-Dateien in Downloads zeigen einen
  anderen Ort. Amtliche Straßenflächen enthalten nur das Hauptstraßennetz, Rest aus OSM.
- Keine Daten aus Google Maps oder Apple Karten (Nutzungsbedingungen verbieten das Abzeichnen, API-Key nötig).
- Datei-Import: `import.js` (Ablagefeld, Datenliste, Kachel-Anzeige, Verortung, Zusammenfassen im Format der
  Beispieldaten mit Einheit 1 m) und `import-worker.js` (Web Worker: CityGML per Textsuche, DXF binär/Text,
  topoexport-Auswertung). JSZip für ZIP. Importe gehen vor die Beispieldaten (`amtlicheDaten` in import.js).
  Testdateien lokal in `_testdaten/` (in .gitignore). DGM1 (GeoTIFF, geotiff.js) über den Knopf „Fehlende Daten
  laden“. `kataster.js`: Flurstücke, tatsächliche Nutzung (WFS ALKIS vereinfacht) und Bodenrichtwerte (WFS BORIS-NI)
  beim Analysieren, nur Niedersachsen. Keine Lagebezeichnungen/Adressen übernehmen.
  `zensus.js`: Zensus-2022-Karten im 100-m-Gitter (EPSG:3035) für den Reiter „Wohnen“: Miete, Leerstand,
  Fläche je Wohnung/Bewohner, Eigentümerquote, Baujahr. Beispiel eingebaut, sonst Zensus-ZIPs importieren.
  „–“ in Zensus-Tabellen = genau null. Vergleichsmieten (Baualter × Größe), Baujahr, Fläche je Wohnung und
  Eigentümerquote kommen beim Analysieren live aus den Kacheln der destatis-Seite „Mietvergleich“ (NIAM2026,
  siehe PLAN.md 8); Mietrechner im Reiter „Wohnen“.
  `infrastruktur.js`: Reiter „Infrastruktur“ (OSM-Orte in 6 Ebenen, Piktogramme aus `piktogramme.js` = Maki CC0,
  Einzugsradien). Overpass-Abfrage auch in `werkzeuge/infra_beispiel.py` (beide gleich halten). Keine Namen bei Arztpraxen.
  `schnitt.js`: Reiter „Schnitt“ (Linie ziehen, Blickrichtung, Tiefe → SVG-Schnitt mit Ansicht aus LoD2, DGM, OSM-Bäumen;
  Ersatzklötze aus OSM wie im 3D-Modell). Braucht `analyseErgebnis.lod2Daten`.
  `diagramme.js`: eigene SVG-Diagramme (kein Chart.js) im Reiter „Kennzahlen“. Reiter „Export“ (`export.js`): alle
  Inhalte als Blätter in Vektorgrafik (SVG in mm, Schriftfeld mit Quellen), PDF über jsPDF + svg2pdf.js, PNG durch
  Rastern desselben Blatts. `vektorplan.js` zeichnet die 2D-Pläne aus dem MapLibre-Stil als SVG (neue Ebenen-Ausdrücke
  ggf. in `auswerten` ergänzen). Exporte nur im Reiter „Export“. `dxf.js`: DXF-Schreiber (AC1027, True Color) für
  Pläne (aus dem Plan-Stil), Schnitt und 3D (aus `dreid.modell`, das `zeichne3D` füllt; Neues im 3D dort ergänzen).
  `steckbrief.js`: Klick auf ein Flurstück im Reiter „Flurstücke“ zeigt dessen Kennzahlen.
- Lokal testen: Seite über einen Webserver öffnen (z. B. `python -m http.server`), nicht per Doppelklick.
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
- Schrift: „Microsoft Yi Baiti“ (nur lokal, nicht mitliefern), Ersatz „Didact Gothic“ (OFL) aus `schriften/`; überall in der
  Oberfläche, auch für Zahlen. Stil nach adept.dk: eine Schriftstärke, Betonung über Größe, keine Versalien, viel Weißraum,
  feine Linien nur bei Tabellen/Legenden. Oberfläche schwarz-weiß, Rot nur in den Plänen.
- Ein Hauptbutton pro Ansicht („Analysieren“).
