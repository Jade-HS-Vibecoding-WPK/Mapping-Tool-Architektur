# Übergabe: Projekt „Ortsanalyse“ (Mapping-Tool-Architektur)

> **An Claude Code in der neuen Sitzung:** Diese Datei fasst die komplette bisherige Sitzung
> zusammen. Lies sie ganz. Lies danach `CLAUDE.md` (Regeln) und `PLAN.md` (ausführlicher Plan) im
> Projektordner. Arbeite dann mit dem nächsten Schritt aus Abschnitt 7 weiter. Fang nicht von vorn
> mit der Planung an. Alle Entscheidungen unten sind von der Nutzerin / dem Nutzer bestätigt.

Stand der Übergabe: 16.11.2026, Grundgerüst fertig.

---

## 1. Wer und worum es geht

- **Nutzer\*in:** Architekturstudent\*in an der **Jade Hochschule**, kann **nicht programmieren**.
  Jeden Schritt **einfach auf Deutsch** erklären und Fachbegriffe kurz übersetzen.
- **Kurs:** WPK „Thinking Architecture through Software Design · Vibecoding KI-Werkstatt“ (eine Woche).
  - Abgabe: Projekt auf GitHub in der Kurs-Organisation **mit gut erklärender README**, dazu ein **Poster**.
  - Arbeitsweise laut Kurs: erst planen (PLAN.md), dann **ein Feature pro Sitzung**, testen,
    committen, Stand in PLAN.md eintragen. „Stell mir erst Fragen, bevor du loslegst.“
  - Kursregeln: keine personenbezogenen Daten, keine API-Keys (nicht in Chats, Screenshots oder auf
    GitHub), Quellen und Lizenzen angeben (OSM verlangt Namensnennung), KI-Nutzung nach den Regeln
    der Hochschule kennzeichnen.
- **Projektziel:** Ein Web-Tool, das für ein Untersuchungsgebiet automatisch **Schwarzplan,
  Straßennetz, Grün/Vegetation, Lageplan und 3D-Gebäudemodell** erfasst, analysiert, kategorisiert
  und übersichtlich visualisiert. Dazu kommen **Kennzahlen, Diagramme** und **Exporte** (PNG
  maßstäblich, DXF für CAD).

## 2. Repository und Git-Stand

- GitHub: `Jade-HS-Vibecoding-WPK/mapping-tool-architektur` (Standardzweig `main`, Apache-2.0-Lizenz)
- Gearbeitet wurde im Zweig **`entwicklung`** mit 2 Commits über `main`:
  1. `Planung: PLAN.md und CLAUDE.md hinzufügen`
  2. `Grundgerüst: Karte von Oldenburg, Rechteck-Auswahl, Layout`
- **Diese Commits sind NICHT auf GitHub.** Push wurde mit 403 abgelehnt, weil die **Claude GitHub
  App für die Organisation „Jade-HS-Vibecoding-WPK“ nicht installiert** ist. Das Neuverbinden des
  GitHub-Kontos hat nicht gereicht. Die Installation muss jemand vornehmen, der die Organisation
  verwaltet (Kursbetreuung): https://github.com/apps/claude/installations/select_target
- Die Nutzerin / der Nutzer hat den Stand als **ZIP** (`ortsanalyse_grundgeruest.zip`) bekommen. Wenn
  die neue Sitzung die Dateien nicht im Repository findet, die ZIP hochladen lassen und deren Inhalt
  ins Repository übernehmen.

## 3. Alle Entscheidungen (bestätigt)

| Thema | Entscheidung |
|---|---|
| Form des Tools | reine Website (HTML/CSS/JS), läuft im Browser, später auf **GitHub Pages**, kein Server |
| Zielgruppe | Architekturstudierende (Ortsanalyse im Entwurf) |
| Grunddaten | **OpenStreetMap** (Overpass-API, ohne Key), Gebiet max. ca. **1 km²** |
| Zusatzdaten | **Datei-Import** (Drag & Drop) von **topoexport** und amtlichen **LoD2-Daten (CityGML)** |
| Import-Formate | **DXF, DWG, CityGML** (dazu ZIP, Should: RAR). DWG zuletzt; falls nicht lesbar, Anleitung zur Umwandlung in DXF |
| Gebäudemodelle | **möglichst LoD2** (echte Dachformen) |
| Endgültiger Lageplan | pro Ebene **und pro Gebäude** die **detaillierteste** Quelle; Form und Eigenschaften dürfen aus verschiedenen Quellen kommen |
| Must-Ebenen | Schwarzplan, Straßennetz, Grün/Vegetation, Lageplan (alle Ebenen + Nordpfeil + Maßstab), 3D-Modell |
| Gebietswahl | **Rechteck aufziehen**; bei topoexport-Import ist dessen Ausschnitt voreingestellt, darin ein kleineres Rechteck wählbar |
| Testgebiet | **Oldenburg Innenstadt** |
| Gestaltung | **klassisch-architektonisch**: Schwarz-Weiß, feine Linien, **eine Akzentfarbe** (Rot `#e2482d`), viel Weißraum |
| Auswertung | Kennzahlen + Diagramme + Export fürs Poster |
| Dichtewerte | „GRZ/GFZ des Quartiers“ immer **brutto (ganzes Gebiet) und netto** (ohne Straße, Bahn, Grün, Wasser) |
| Nebengebäude/Überdachungen | **eigene Kategorie**: grau im Schwarzplan, getrennt gezählt, ausblendbar (ALKIS-Funktion `51009_…`) |
| Bild-Export | **maßstäblich** 1:1000 / 1:2000 / 1:5000, A4–A0, 300 dpi, mit Nordpfeil, Maßstab und Quellen |
| DXF-Export | Must. Layer pro Kategorie, 1 Einheit = 1 m, **alle 3D-Daten bleiben erhalten** (Gebäude als Wand-/Dachflächen, Gelände, 3D-Bäume) |
| CAD-Zielprogramme | **Allplan 2024** und **ArchiCAD 29** (Hochschulversionen); je eine Export-Voreinstellung |
| Demo-Daten | Oldenburger Testdaten fest eingebaut: Knopf **„Beispiel Oldenburg laden“** |
| 3D als Bild | Should (Axonometrie fürs Poster) |
| Bewusst nicht | eingescannte Pläne/PDF-Bilder automatisch erkennen |
| Planung | keine Einteilung in Kurstage, nur eine Reihenfolge der Schritte |

## 4. Ergebnisse der Datenanalyse (Beispieldateien der Nutzerin / des Nutzers)

Die Beispieldateien waren nur in der alten Sitzung hochgeladen. **Für die Weiterarbeit müssen sie
erneut hochgeladen werden** (siehe Abschnitt 6). Alle Details stehen in `PLAN.md`, Abschnitte 4b-2 bis 4b-4.

**topoexport 2D-DXF** (`topoexport_2D_vectorial.dxf`, 7,4 MB)
- **Binäre DXF**, AutoCAD 2010 (AC1024), Meter, Ausschnitt ca. 1012 × 1009 m.
- **Lokale Koordinaten**: Nullpunkt unten links, keine Georeferenz in der Datei.
- Layer mit Präfix `TPX_`: `BUILDINGS` (1827 ALKIS-Grundrisse), `CADASTRES` (1475 Flurstücke mit
  Nummer, ohne Eigentümer), `ROADS_AXES`/`ROADS_CONTOURS` (ohne Straßenkategorie), `RAILWAYS_*`,
  `VEGETATION_GREEN_SPACES` (ohne Unterart), `VEGETATION_TREES_INDIVIDUAL` (4401 Bäume als Blöcke;
  Blockname enthält Stamm- und Kronenradius, z. B. `TREETR005_CR057` ≈ Krone 5,7 m), `WATERWAYS`,
  `CONTOUR_LINES_5M`, `FRAME_PROJECT`, Schatten-Layer.
- `TPX_BUILDING_HEIGHTS_TEXT` sagt bei **allen** Gebäuden „H 6.0 m“. Das ist ein **Platzhalter, nie verwenden**.
- Z-Werte 0,00–0,05 sind nur Zeichenreihenfolge, keine Höhen.

**topoexport 3D-DXF** (`topoexport_3D_modeling.dxf`, 16,2 MB)
- Binär, gleicher Rahmen und **gleicher Nullpunkt** wie 2D.
- **Echte Höhen** (NHN), Gelände −0,9 bis 8,3 m.
- Gebäude = **LoD2 als MESH** (4152 Teile, ca. 127 000 Dreiecke, ohne Attribute, mehrere Teile pro
  Gebäude, max. 83 m), Gelände-MESH (ca. 20-m-Raster), Straßen/Grün/Wasser als 3D-Netze, 3D-Bäume
  (Stamm und Krone, 106 Varianten).
- Wand und Dach sind über die Flächenneigung trennbar. Teile werden per ALKIS-Grundriss aus der 2D-Datei
  einem Gebäude zugeordnet.

**topoexport-Lizenz** (`LICENSE.txt`): Gebäude 2D/3D, Parzellen, Straßen, Bahn, Gewässer, DGM:
**LGLN Niedersachsen, CC BY 4.0**. Bäume und Grünflächen: **Overture Maps, ODbL**. Kronenhöhen:
**Meta/WRI, CC BY 4.0**. Hinweis: Die Daten sind **nicht vermessungsgenau**.

**CityGML LoD2 vom LGLN** (Kacheln `LoD2_32_<Ost-km>_<Nord-km>_1_ni.gml`)
- CityGML 1.0, AdV-Profil, **EPSG:25832 (ETRS89/UTM 32)** + Höhen **DHHN2016 (NHN)**.
- 1×1-km-Kacheln, 13–57 MB ausgepackt (ZIP über 90 % kleiner).
- `bldg:Building` + `BuildingPart`, getrennte `WallSurface`/`RoofSurface`/`GroundSurface`/`ClosureSurface`.
- Attribute: `bldg:function` (ALKIS-Code, z. B. `31001_1000` Wohngebäude, `31001_2010` Handel/DL,
  `31001_2310` Handel/DL mit Wohnen, `51009_1610` Überdachung), `roofType`, `measuredHeight` und
  gen-Attribute (`Firsthoehe`, `MittlereTraufHoehe`, `AbsoluteHoehe`, `DachtypName`, `Dachneigung` …).
- **Keine Geschosszahl**: Sie wird aus der Höhe geschätzt (ca. 3 m je Geschoss) und gekennzeichnet.
- Adresse enthält nur „Oldenburg (Oldb), Stadt“, keine personenbezogenen Daten.

**Verortung der topoexport-Dateien (getestet):** Ein Abgleich der Gebäudegrundrisse ergab den
topoexport-Nullpunkt bei **UTM32 Ost 446 885,3 / Nord 5 887 643,7**. Testgebiet damit
**Ost 446 885–447 897, Nord 5 887 644–5 888 653**. Ca. 900 Gebäude passten auf < 3 m. Das 83-m-Gebäude
liegt in beiden Quellen an derselben Stelle.

**Kacheln:** Das Testgebiet braucht die Kacheln `446_5887`, `446_5888`, `447_5887`, `447_5888`.
Vorhanden waren `447_5888`, `447_5887` (dazu `448_5887`, `448_5888`, die östlich außerhalb liegen).
Es fehlt der westliche Randstreifen (115 m, ca. 265 Gebäude). Dort greift die topoexport-3D-Datei als Ersatz.

**Lehren für die Umsetzung:**
- Gebäude quellenübergreifend über **Flächenüberlappung (> 50 %)** zuordnen, nicht über
  Mittelpunkte (die trafen nur ca. 68 %).
- Das Tool muss **anzeigen, welche Kacheln benötigt werden, fehlen oder überflüssig sind** (Must).
- Viele JavaScript-DXF-Leser können **keine binäre DXF**. Die Bibliothek danach auswählen oder einen
  eigenen kleinen Leser schreiben.

**Detailstufen-Regel Gebäude:** 1. CityGML LoD2, 2. topoexport-3D, 3. topoexport-2D (ALKIS), 4. OSM.
Form vom höchsten Rang, fehlende Eigenschaften aus den anderen Quellen. Straßen- und Grün-Kategorien
kommen aus OSM, die Geometrie aus topoexport.

## 5. Was schon gebaut ist (Grundgerüst)

Dateien im Repository: `index.html`, `style.css`, `app.js`, `PLAN.md`, `CLAUDE.md`, `README.md`.
- Bibliotheken per CDN: **MapLibre GL JS 4.7.1** (unpkg), **Turf 7.1.0** (jsdelivr).
- Karte von Oldenburg (OSM-Rasterkacheln, per `raster-saturation` grau), Zoom, Kompass (Nordpfeil),
  Maßstabsleiste, Quellenangabe.
- Seitenleiste: 01 Gebiet wählen (Knopf „Rechteck zeichnen“, Ziehen mit Maus oder Finger, Esc
  bricht ab, „Löschen“; Anzeige Breite × Höhe und Fläche; Warnung über 1 km²), 02 Daten
  (Ablagefeld und „Beispiel Oldenburg laden“, noch **ohne Funktion**), roter Hauptknopf
  **„Analysieren“** (wird aktiv, sobald ein gültiges Gebiet gewählt ist, **noch ohne Funktion**).
- Reiter: Karte, Schwarzplan, Straßennetz, Grün, Lageplan, 3D, Kennzahlen (außer Karte noch Platzhalter).
- Handy-Ansicht: Seitenleiste über der Karte.
- Im Browser getestet (Playwright, Desktop und 390 px). Ein Fehler (`[hidden]` wurde durch CSS
  überschrieben) ist behoben.
- Testhinweis für Cloud-Sitzungen: unpkg, jsdelivr und OSM-Kacheln waren aus der Container-Umgebung
  gesperrt (403). Lösung: Bibliotheken per `npm install` lokal holen und im Playwright-Test die
  CDN-Adressen darauf umleiten. Kacheln durch ein Test-PNG ersetzen.

## 6. Was die Nutzerin / der Nutzer in der neuen Sitzung bereithalten sollte

1. Diese Datei (`UEBERGABE.md`).
2. Den Projektstand: entweder ist der Zweig `entwicklung` inzwischen auf GitHub, oder die ZIP
   `ortsanalyse_grundgeruest.zip` hochladen.
3. Für die Daten-Schritte die Beispieldateien erneut hochladen:
   `topoexport_2D_vectorial.dxf`, `topoexport_3D_modeling.dxf`, `LICENSE.txt` (topoexport) und die
   CityGML-Kacheln als **ZIP** (`LoD2_32_447_5887`, `LoD2_32_447_5888`, optional `446_5887`, `446_5888`).

## 7. Nächste Schritte (Reihenfolge laut PLAN.md, Abschnitt 6)

1. ✅ Idee und Plan
2. ✅ Grundgerüst und Aussehen
3. **Datenquellen prüfen** (offen: Zeigt topoexport die Koordinaten des Ausschnitts an oder bietet
   es einen Export in UTM 32 an? Ist es kostenlos? Gibt es einen automatischen Abruf?)
4. **← als Nächstes: OSM-Daten laden und 2D-Pläne.** Nach „Analysieren“ Overpass-Abfrage für das
   Rechteck, dann Schwarzplan, Straßennetz (Kategorien über die Linienstärke), Grün, Lageplan und
   die ersten Kennzahlen.
5. Datei-Import und Detailstufen-Regel (zuerst CityGML und DXF, dann DWG), Verortung (von Hand =
   Must, automatisch = Should), Anzeige der benötigten Kacheln.
6. 3D-Modell mit LoD2 (three.js)
7. Diagramme und PNG-Export (maßstäblich)
8. DXF-Export für CAD (erst 2D, dann alle 3D-Daten), Test in Allplan 2024 und ArchiCAD 29
9. Veröffentlichen auf GitHub Pages
10. Polieren und präsentieren: README, Poster

## 8. Offene Punkte

- **Push freischalten:** Claude GitHub App für die Organisation installieren (Kursbetreuung).
- **Früh testen:** die topoexport-3D-DXF in Allplan 2024 und ArchiCAD 29 öffnen. Kommen MESH-Gebäude,
  Gelände und Bäume an? Daran entscheidet sich, ob der Export MESH oder 3DFACE schreibt. Den Test
  macht die Nutzerin / der Nutzer und schickt Screenshots.
- DWG-Beispieldatei fehlt noch.
- Optional die CityGML-Kacheln `446_5887` und `446_5888`.
- Hinweis: Die Hintergrundkarte nutzt tile.openstreetmap.org. Für ein Studienprojekt ist das in
  Ordnung, für viele Nutzer bräuchte es einen anderen Dienst.

## 9. Vorschlag für die erste Nachricht in der neuen Sitzung

> Ich studiere Architektur und kann nicht programmieren. Erklär mir jeden Schritt einfach.
> Im Anhang ist `UEBERGABE.md` aus meiner letzten Sitzung. Lies sie, dann `CLAUDE.md` und `PLAN.md`
> im Projekt, und mach mit dem nächsten Schritt weiter: OSM-Daten laden und die 2D-Pläne.
> Stell mir erst Fragen, bevor du loslegst.
