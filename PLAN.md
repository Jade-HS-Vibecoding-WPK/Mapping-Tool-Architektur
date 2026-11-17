# PLAN.md – Stadtanalyse-Tool

> Arbeitstitel: **„Ortsanalyse“**: ein Web-Tool, das für ein frei gewähltes Gebiet automatisch
> Schwarzplan, Straßennetz, Grün/Vegetation, Lageplan und 3D-Modell erzeugt, auswertet und
> kompakt zusammenfasst.

Stand: **Grundgerüst steht** (siehe Abschnitt 8).

---

## 1. Ziel in einem Satz

Architekturstudierende ziehen auf einer Karte ein Rechteck auf. Das Tool lädt automatisch die
Daten aus OpenStreetMap, zeichnet daraus Pläne im klassischen Architektur-Look, berechnet
Kennzahlen und gibt alles als Bild oder PDF für Poster und Layout aus.

## 2. Entscheidungen aus dem Interview

| Frage | Entscheidung |
|---|---|
| Datenquelle | **OpenStreetMap** als Grundlage, **zusätzlich Dateien aus Diensten wie topoexport** (siehe Abschnitt 4a) |
| Gebäudemodelle | **möglichst LoD2** (echte Dachformen), sonst Ersatz aus OSM |
| Endgültiger Lageplan | pro Ebene wird **die detaillierteste vorhandene Datei** verwendet |
| Analysegebiet bei Import | Standard = topoexport-Ausschnitt; darin kann ein **kleineres Rechteck** gewählt werden |
| Dichtewerte | **brutto** (ganzes Gebiet) **und netto** (Bauland ohne Straßen, Grün, Wasser) |
| Bild-Export | **maßstäblich**: 1:1000 / 1:2000 / 1:5000, Papierformat A4–A0 |
| Nebengebäude/Überdachungen | **eigene Kategorie**: grau im Schwarzplan, getrennt in den Kennzahlen, ein- und ausblendbar |
| Demo-Daten | Oldenburger Testdaten fest im Tool: Knopf **„Beispiel Oldenburg laden“** |
| 3D-Ansicht als Bild | Ja, als **Should** (Axonometrie fürs Poster) |
| CAD-Zielprogramme | **Allplan 2024 und ArchiCAD 29** (an der Hochschule installiert): Der DXF-Export wird genau auf diese beiden abgestimmt und darin getestet |
| Gebietswahl | **Rechteck auf der Karte aufziehen** |
| Testgebiet | **Oldenburg Innenstadt** (Altstadt-Ring, Schlossgarten, Bahnhof) |
| Zielgruppe | **Architekturstudierende** (Ortsanalyse im Entwurf) |
| Gestaltung | **Klassisch-architektonisch**: Schwarz-Weiß, feine Linien, eine Akzentfarbe, viel Weißraum |
| Lageplan | **Alle Ebenen übereinander**, mit Nordpfeil und Maßstabsleiste |
| Auswertung | **Kennzahlen + Diagramme + Export für das Poster** |

## 3. Must / Should / Could

### MUST: muss bei der Abgabe laufen
1. **Gebiet wählen:** Karte von Oldenburg, Rechteck aufziehen, Knopf „Analysieren“. Sind
   topoexport-Dateien geladen, ist deren Ausschnitt voreingestellt. Darin kann man ein kleineres
   Rechteck aufziehen, und nur das wird ausgewertet.
2. **Daten laden:** Gebäude, Straßen, Grünflächen, Bäume und Wasser automatisch aus OSM holen.
3. **Schwarzplan:** Gebäude schwarz auf weiß. Nebengebäude und Überdachungen (z. B. Carports,
   ALKIS-Funktion `51009_…`) erscheinen **grau** als eigene Kategorie und lassen sich ausblenden.
4. **Straßennetz:** Straßen nach Kategorie, über die Linienstärke unterschieden
   (Hauptstraße, Nebenstraße, Wohnstraße, Fuß- und Radweg).
5. **Grün und Vegetation:** nach Kategorie (Park, Wald, Wiese/Rasen, Einzelbaum, Wasser),
   in Grau- und Grünabstufungen.
6. **Lageplan:** alle Ebenen übereinander, mit Nordpfeil und Maßstab.
7. **3D-Gebäudemodell in LoD2:** Gebäude mit echten Dachformen aus einem LoD2-Datensatz
   (für Oldenburg vom Land Niedersachsen). Fehlt für ein Gebäude ein LoD2-Modell, baut das Tool
   ersatzweise einen einfachen Klotz aus OSM (Geschosse × 3 m) und kennzeichnet ihn.
8. **Datei-Import in den Formaten DXF, DWG und CityGML:** Zusatzdaten (z. B. aus topoexport oder
   LoD2-Kacheln) per Drag & Drop ins Tool ziehen. Das Tool erkennt, was in der Datei steckt, und
   ordnet es der richtigen Ebene zu (siehe Abschnitt 4b). topoexport-Dateien werden automatisch
   erkannt. Dateien ohne echte Koordinaten werden von Hand auf der Karte **verortet** (Abschnitt 4b-2).
   Mehrere CityGML-Kacheln auf einmal und gezippte Dateien (.zip) werden angenommen (Abschnitt 4b-4).
9. **Detailstufen-Regel für den Lageplan:** Gibt es für eine Ebene mehrere Quellen, nimmt das
   Tool automatisch die detaillierteste (siehe Abschnitt 4a). Im Plan steht, welche Quelle genutzt wurde.
10. **Kennzahlen-Tafel** (siehe Abschnitt 4).
11. **Diagramme:** Flächenanteile (bebaut / grün / Verkehr / sonstige) und Gebäude nach Nutzung.
12. **Bild-Export, maßstäblich:** Pläne einzeln als PNG herunterladen, Maßstab wählbar
    (1:1000 / 1:2000 / 1:5000) und Papierformat wählbar (A4–A0, hoch/quer). Der Plan ist
    maßstabsgetreu und druckfertig (300 dpi), mit Nordpfeil, Maßstabsleiste und Quellenangabe.
13. **DXF-Export für CAD, inklusive aller 3D-Daten:** den Lageplan als DXF-Datei herunterladen, die
    man in **Allplan und ArchiCAD** öffnen und weiterzeichnen kann (je eine passende Voreinstellung).
    Alle Höhen und 3D-Körper bleiben erhalten (siehe Abschnitt 4c).
14. **Demo-Daten:** Knopf „Beispiel Oldenburg laden“ lädt die eingebauten Testdaten (topoexport 2D
    und 3D, CityGML-Kacheln `447_5887` und `447_5888`). So funktioniert die Präsentation auch ohne Upload.
    Die Quellen und Lizenzen stehen im Tool und in der README.
15. **Online:** als Website auf GitHub Pages, mit README.

### SHOULD: wäre gut
- Export als **PDF-Übersichtsblatt** (alle Pläne und Kennzahlen auf einer Seite), auch maßstäblich.
- **3D-Ansicht als Bild** speichern (Axonometrie im Weiß-Grau-Look, fürs Poster).
- **Gebiet per Adresse und Radius** wählen.
- Kategorien **ein- und ausblenden** (z. B. nur Fußwege).
- Diagramm der **Geschosszahlen** (Höhenverteilung).
- Kurze **Erklärung zu jeder Kennzahl** (Info-Symbol mit kurzem Erklärtext).

### COULD: wenn Zeit bleibt
- Freie Form (Polygon) statt Rechteck.
- Umschalter auf eine farbig-analytische Darstellung.
- Zwei Gebiete vergleichen.
- Export als SVG zum Weiterbearbeiten in Illustrator.
- Textfazit durch eine KI (braucht API-Key, darum nur optional).

### Bewusst NICHT im Projekt
- Eigene Pläne/PDFs hochladen und automatisch erkennen (zu unzuverlässig für eine Woche).

## 4. Kennzahlen (Must)

| Kennzahl | Bedeutung |
|---|---|
| Gebietsfläche | Größe des Rechtecks in m² / ha |
| Anzahl Gebäude | Zahl der Gebäude im Gebiet |
| Bebaute Fläche / Bebauungsanteil | Summe der Gebäudegrundflächen, Anteil an der Fläche („GRZ des Quartiers“), **brutto und netto** |
| Nebengebäude/Überdachungen | eigene Fläche und Anzahl, nicht in der bebauten Fläche oben enthalten |
| Mittlere Geschosszahl | Durchschnitt, mit Hinweis, wie viele Gebäude einen Ersatzwert haben |
| Geschossfläche (geschätzt) / Dichte | Grundfläche × Geschosse; Verhältnis zur Fläche („GFZ des Quartiers“), **brutto und netto** |

**Brutto und netto:** *Brutto* bezieht sich auf das ganze Untersuchungsgebiet. *Netto* bezieht sich
nur auf das Bauland, also das Gebiet ohne Straßen-, Bahn-, Grün- und Wasserflächen. Netto liegt näher
an der echten GRZ/GFZ aus dem Bebauungsplan. Beide Werte stehen nebeneinander, mit kurzer Erklärung.
| Grünanteil | Grün- und Wasserflächen in % des Gebiets, dazu die Zahl der Einzelbäume |
| Kronenüberdeckung | Anteil des Gebiets unter Baumkronen in % (aus den Kronengrößen von topoexport) |
| Parzellen (Should) | Anzahl Flurstücke, mittlere Flurstücksgröße („Körnung“ des Quartiers) |
| Straßenlänge | Gesamt und nach Kategorie, in m |
| Gebäude nach Nutzung | Wohnen, Gewerbe/Handel, öffentlich, Kirche, unbekannt …, möglichst aus der amtlichen Gebäudefunktion (CityGML), sonst aus OSM |
| Dachlandschaft (Should) | Anteil der Dachformen (Flach-, Sattel-, Walmdach …) aus CityGML |

## 4a. Datenquellen und Detailstufen

**Warum mehrere Quellen?** OpenStreetMap lädt das Tool automatisch, die Daten sind aber oft grob.
Dienste wie topoexport und amtliche Daten (Kataster, LoD2) sind genauer. Sie werden meist auf deren
Website ausgewählt und als Datei heruntergeladen. Darum bekommt das Tool einen **Datei-Import**.

**Was ist LoD2?** „Level of Detail 2“ ist ein Gebäudemodell mit echter Dachform (Sattel-, Walm-,
Flachdach …). LoD1 ist nur ein Klotz mit Flachdach. Ein reiner Grundriss hat gar keine Höhe.

**Detailstufen-Regel:** Pro Ebene gewinnt die detaillierteste Quelle:

| Ebene | 1. Wahl (am detailliertesten) | 2. Wahl | 3. Wahl (immer da) |
|---|---|---|---|
| Gebäude 3D | LoD2-Modell | LoD1-Modell | OSM-Grundriss × Geschosse |
| Gebäude 2D (Schwarzplan) | Kataster-Grundriss (ALKIS) aus Import | Grundfläche aus LoD2 | OSM-Grundriss |
| Straßen | Import mit Straßenflächen und Bordsteinen | Import mit Straßenachsen | OSM-Linien |
| Grün/Bäume | Import (z. B. Baumkataster, Nutzungsflächen) | n/a | OSM |
| Gelände (Could) | Import mit Höhenmodell | n/a | flach |

„Detailliert“ misst das Tool ganz einfach: Wie viele Punkte und Flächen hat ein Objekt, gibt es eine
Höhe, gibt es Dachflächen? Wer mehr hat, gewinnt. Die Regel gilt für **jedes Gebäude einzeln**:
Wo LoD2 fehlt, springt die nächste Stufe ein.

**Noch zu prüfen (bevor wir die Daten anbinden):** Die Seiten von topoexport und vom
Landesamt (LGLN, Open-Data-Portal Niedersachsen) konnte ich aus dieser Arbeitsumgebung nicht öffnen.
Bei beiden müssen wir vor dem Bauen nachsehen:
- ob es dort **DXF, DWG oder CityGML** gibt (siehe Abschnitt 4b).
- ob die Daten **kostenlos** sind und welche **Lizenz und Quellenangabe** gilt.
- ob man **automatisch** abrufen kann oder nur **von Hand herunterladen**.
- wie groß ein **Gebiet bzw. eine Kachel** sein darf.

## 4b. Import-Formate: DXF, DWG, CityGML

| Format | Was steckt drin | Wofür im Tool | Schwierigkeit im Browser |
|---|---|---|---|
| **CityGML** | amtliche 3D-Stadtmodelle (LoD1/LoD2) mit Wänden, Dächern, Höhen und oft Nutzung | 3D-Modell, Gebäudegrundflächen, Höhen für die Kennzahlen | **mittel**: lesbar, aber die Dateien sind oft sehr groß |
| **DXF** | CAD-Zeichnung aus Linien, Flächen und Layern (z. B. von topoexport oder aus dem Kataster) | Lageplan, Schwarzplan, Straßen, Grün (über die Layernamen) | **gut machbar**: offenes Format. topoexport liefert aber **binäre** DXF, und das kann nicht jede Lese-Bibliothek |
| **DWG** | wie DXF, aber das eigene Format von AutoCAD | wie DXF | **schwer**: kein offenes Format. Es gibt nur wenige, große Lese-Bibliotheken |

**Wie das Tool die Formate behandelt:**
- **CityGML:** wird direkt gelesen. Die Detailstufe (LoD1/LoD2) steht in der Datei, so findet die
  Detailstufen-Regel automatisch das beste Modell.
- **DXF:** wird direkt gelesen. Die **Layernamen** (z. B. „Gebaeude“, „Strasse“, „Baum“) bestimmen,
  zu welcher Ebene etwas gehört. Erkennt das Tool einen Layer nicht, kannst du ihn in einer kleinen
  Liste selbst zuordnen.
- **DWG:** Wir versuchen, DWG mit einer Lese-Bibliothek direkt zu lesen. Klappt das nicht
  zuverlässig, zeigt das Tool eine Anleitung, wie man die Datei mit einem kostenlosen Programm in
  DXF umwandelt. Danach läuft sie über den DXF-Weg.

**Wichtiger Punkt: Koordinaten.** Amtliche Daten in Niedersachsen liegen meist im
Koordinatensystem **ETRS89 / UTM Zone 32** (Kürzel EPSG:25832). Die Karte im Tool rechnet mit
Längen- und Breitengraden. Das Tool rechnet die Koordinaten automatisch um. Bei CityGML steht
das System in der Datei. Bei DXF und DWG oft nicht. Dann nimmt das Tool UTM 32 an und lässt
dich das im Notfall ändern. Liegt eine CAD-Datei in lokalen Koordinaten (z. B. Nullpunkt in der
Grundstücksecke), wird sie nicht am richtigen Ort liegen. Das zeigt das Tool als Warnung an.

**Testdateien:** Für jedes Format brauchen wir eine echte Beispieldatei aus Oldenburg. Ideal:
LoD2-Kachel als CityGML vom Land, Lageplan als DXF und als DWG von topoexport.

## 4b-2. Erkenntnisse aus der topoexport-Beispieldatei (2D-DXF)

Untersucht: `topoexport_2D_vectorial.dxf` (7,4 MB) und `LICENSE.txt` von topoexport.

**Eckdaten der Datei**

| Merkmal | Befund | Bedeutung für das Tool |
|---|---|---|
| Format | **binäre DXF** (nicht Text), Version AutoCAD 2010 | Das Tool muss binäre DXF lesen können. Viele einfache DXF-Leser im Browser können nur Text-DXF, darum müssen wir das Leseprogramm danach auswählen. |
| Einheit | Meter | passt direkt |
| Ausschnitt | ca. **1012 × 1009 m** (etwa 1 km²) | passt genau zu unserer Gebietsgrenze |
| Koordinaten | **lokal**: Nullpunkt unten links, **keine Angabe, wo auf der Erde** | Das Tool kann die Datei **nicht automatisch** auf der Karte platzieren (siehe „Verortung“ unten) |
| Höhen (Z) | nur winzige Werte (0,00–0,05 m) | Das sind **keine echten Höhen**, sie legen nur die Zeichenreihenfolge der Ebenen fest. Das Tool behandelt diese Datei als reine 2D-Datei. |
| Farben | alle Layer gleich (Farbe 7, „nach Layer“) | Farben und Linienstärken legt unser Tool selbst fest |

**Layer und Zuordnung zu unseren Ebenen**

| topoexport-Layer | Inhalt (Anzahl) | Unsere Ebene | Hinweis |
|---|---|---|---|
| `TPX_BUILDINGS` (+ `_HATCH`) | Gebäudegrundrisse, geschlossene Polylinien (1827) | Schwarzplan / Gebäude 2D | amtliche **ALKIS-Grundrisse**: genauer als OSM, also 1. Wahl für 2D |
| `TPX_BUILDING_AREAS_TEXT` | Text „S 45 m²“ (1798) | – | rechnet das Tool selbst, wird nicht gebraucht |
| `TPX_BUILDING_HEIGHTS_TEXT` | Text „H 6.0 m“ (1798) | – | **Achtung: bei allen Gebäuden 6,0 m**, also nur ein Platzhalter und keine echte Höhe. Echte Höhen kommen aus LoD2. |
| `TPX_BUILDINGS_SHADOWS_*` | Schattenwurf (3957) | optional | als Darstellungs-Extra (Could) |
| `TPX_CADASTRES` (+ `_TEXT`) | Flurstücke mit Flurstücksnummer (1475) | **neue Ebene: Parzellen** | Bonus für die Analyse (z. B. Parzellengröße, Körnung). Nur Nummern, keine Eigentümer |
| `TPX_ROADS_CONTOURS` (+ `_HATCH`) | Straßenflächen (92) | Straßennetz (Flächen) | genauer als OSM-Linien |
| `TPX_ROADS_AXES` | Straßenachsen (380) | Straßennetz (Linien) | **ohne Kategorie** (Haupt-/Wohnstraße …). Die Kategorie holt das Tool aus OSM. |
| `TPX_RAILWAYS_*` | Bahnachsen und -flächen | **neue Ebene: Bahn** | – |
| `TPX_VEGETATION_GREEN_SPACES` (+ `_HATCH`) | Grünflächen (148) | Grün | **ohne Unterart** (Park/Wiese/Wald). Die Art holt das Tool aus OSM. |
| `TPX_VEGETATION_TREES_INDIVIDUAL` | Einzelbäume als Blöcke (4401) | Bäume | sehr wertvoll: Der Blockname enthält **Stamm- und Kronengröße** (z. B. `TREETR005_CR057`, Kronenradius ≈ 5,7 m). Damit kann das Tool die **Kronenüberdeckung** berechnen. |
| `TPX_WATERWAYS` (+ `_HATCH`) | Gewässer (26) | Wasser | – |
| `TPX_CONTOUR_LINES_5M` (+ `_TEXT`) | Höhenlinien alle 5 m (nur 0 m und 5 m) | Gelände | Oldenburg ist sehr flach. Höhenlinien sind nur ein Extra. |
| `TPX_FRAME_PROJECT` | Rahmen des Ausschnitts | Gebiet | zeigt die Grenze des Untersuchungsgebiets |

Alle Layer beginnen mit `TPX_`. Daran erkennt das Tool automatisch, dass die Datei von topoexport
stammt, und ordnet die Layer ohne Nachfragen zu. Andere DXF-Dateien ordnest du wie geplant von
Hand zu.

**Verortung: die Datei an die richtige Stelle der Karte legen**
Weil die Datei keine echten Koordinaten enthält, braucht das Tool eine Verortung:
- **Must:** Das Tool legt den Rahmen der Datei (ca. 1 × 1 km) als verschiebbares Rechteck auf die
  Karte. Du schiebst ihn an die richtige Stelle, bis die Gebäude der Datei auf den Gebäuden der
  Karte liegen. Alternativ gibst du die Koordinate der linken unteren Ecke ein, falls topoexport sie anzeigt.
- **Should:** Automatische Verortung: Das Tool vergleicht die Gebäudegrundrisse der Datei mit
  den OSM-Gebäuden und findet die passende Lage selbst.
- Zu klären: Zeigt topoexport beim Export die Koordinaten des Ausschnitts an, oder gibt es eine
  Export-Option mit echten Koordinaten (UTM 32)? Damit wäre die Verortung sofort gelöst.

**Was die Datei für die Detailstufen-Regel bedeutet**

| Ebene | Geometrie (Form) aus | Eigenschaften (Art, Höhe) aus |
|---|---|---|
| Gebäude 2D | topoexport (ALKIS) | Nutzung aus OSM bzw. LoD2 |
| Gebäude 3D | LoD2 (CityGML oder topoexport-3D, siehe 4b-3) | Höhen aus LoD2, **nicht** aus „H 6.0 m“ |
| Straßen | topoexport (Flächen + Achsen) | Kategorie aus OSM |
| Grün | topoexport | Art (Park/Wiese/Wald) aus OSM |
| Bäume | topoexport (mit Kronengröße) | n/a |
| Wasser, Bahn, Parzellen | topoexport | n/a |

Daraus folgt eine neue Regel: **Form und Eigenschaften können aus verschiedenen Quellen kommen.**
Das Tool nimmt die genaueste Form und hängt die Eigenschaften aus der Quelle an, die sie hat,
z. B. ALKIS-Grundriss mit OSM-Nutzung.

**Lizenz (aus `LICENSE.txt`)**
- Gebäude 2D/3D (LoD2), Parzellen, Straßen, Bahn, Gewässer, Gelände: **LGLN Niedersachsen,
  CC BY 4.0**
- Bäume und Grünflächen: **Overture Maps Foundation, ODbL**; Kronenhöhen: Meta/WRI, CC BY 4.0
- Pflicht: Diese Quellen nennen wir in jedem Plan, Export und in der README (Layer `BESCHRIFTUNG`).
- topoexport weist darauf hin, dass die Daten **nicht vermessungsgenau** sind. Diesen Hinweis
  übernehmen wir ins Tool.

## 4b-3. Erkenntnisse aus der topoexport-Beispieldatei (3D-DXF)

Untersucht: `topoexport_3D_modeling.dxf` (16,2 MB).

**Das Wichtigste vorab:** Die 3D-Datei enthält bereits **LoD2-Gebäude mit echten Dachformen** und
ein **Geländemodell**, beides vom Landesamt Niedersachsen. Sie hat **denselben Ausschnitt und denselben
Nullpunkt** wie die 2D-Datei. Beide Dateien passen also genau übereinander.

**Eckdaten**

| Merkmal | Befund | Bedeutung für das Tool |
|---|---|---|
| Format | binäre DXF, AutoCAD 2010, Meter | wie die 2D-Datei |
| Koordinaten | lokal, gleicher Rahmen (1012 × 1009 m) wie die 2D-Datei | Eine Verortung reicht für beide Dateien. Das Tool erkennt am gleichen Rahmen, dass sie zusammengehören. |
| Höhen (Z) | **echte Höhen**, Gelände zwischen –0,9 m und 8,3 m (vermutlich über Normalhöhennull, NHN) | Höhen werden übernommen und im Export erhalten |
| 3D-Objekte | **MESH** (Dreiecksnetze, ca. 127 000 Dreiecke bei den Gebäuden) | im Tool darstellbar. Im Export bleiben sie unverändert |

**Layer**

| topoexport-Layer | Inhalt (Anzahl) | Unsere Ebene | Hinweis |
|---|---|---|---|
| `TPX_BUILDINGS` | Gebäude als 3D-Netze (4152 Teile) | Gebäude 3D | **LoD2**: Knapp die Hälfte hat geneigte Dächer. Höhen von 0,1 bis 83 m (wahrscheinlich ein Kirchturm), typisch ca. 10 m. Ein Gebäude kann aus mehreren Teilen bestehen |
| `TPX_TERRAIN_TERRAIN_MESH` | Geländemodell (1 Netz, Raster ca. 20 m) | Gelände | ergibt die neue Export-Ebene `GELAENDE` |
| `TPX_TERRAIN_CONTOUR_LINES` (+ `_TEXT`) | Höhenlinien 0 m / 5 m | Gelände | wie in 2D |
| `TPX_ROADS_HATCH` | Straßenflächen als 3D-Netze, aufs Gelände gelegt (372) | Straßen 3D | – |
| `TPX_ROADS_AXES`, `TPX_ROADS_CONTOURS` | Achsen und Ränder als 3D-Linien | Straßen | – |
| `TPX_VEGETATION_GREEN_SPACES` (+ `_HATCH`) | Grünflächen als 3D-Linien und -Netze | Grün | – |
| `TPX_VEGETATION_TREES_INDIVIDUAL` | **3D-Bäume** (4401), Stamm + Krone als Netz, 106 Varianten, ca. 4–18 m hoch | Bäume 3D | Höhe und Kronenbreite je Baum |
| `TPX_WATERWAYS*` | Gewässer als 3D-Linien und -Netze | Wasser | – |
| `TPX_RAILWAYS_AXES` | Bahnachsen (3D) | Bahn | – |
| `TPX_CADASTRES` (+ `_TEXT`) | Flurstücke als 3D-Linien | Parzellen | – |

**Was fehlt:**
- Die Gebäude-Netze haben **keine Zusatzinformationen**: keine Nutzung, keine Geschosszahl,
  keine Gebäudenummer und keine Trennung in Wand und Dach.
  - **Wand und Dach:** Das Tool erkennt sie selbst an der Neigung der Flächen. Senkrecht ist Wand, sonst Dach.
    So bekommen wir die geplanten Export-Layer `GEBAEUDE_3D_WAND` und `GEBAEUDE_3D_DACH`.
  - **Nutzung und Geschosse:** Die Nutzung kommt aus OSM oder CityGML. Die Geschosszahl schätzt das
    Tool aus der echten Höhe (Höhe ÷ ca. 3 m), wenn sie nirgends angegeben ist.
- Die 2D-Grundrisse (ALKIS) stehen nur in der 2D-Datei. Darum ist es gut, **beide Dateien zusammen** zu laden.

**Neue Möglichkeiten durch die Datei:**
- **Echte Gebäudehöhen** für alle Gebäude, nicht nur für die mit OSM-Angabe. Damit werden mittlere Höhe,
  Geschossfläche und Dichte viel genauer.
- **Höhendiagramm** (Should) mit echten Werten.
- **3D-Ansicht mit Gelände und Bäumen**, nicht nur mit Gebäuden.

**Zuordnung „welches Netz gehört zu welchem Gebäude“:** Das Tool legt jedes 3D-Teil auf die
ALKIS-Grundrisse der 2D-Datei. Liegt es in einem Grundriss, gehört es zu diesem Gebäude.

**Aktualisierte Detailstufen-Regel für Gebäude 3D:**

| Rang | Quelle | Warum |
|---|---|---|
| 1 | **CityGML LoD2** | gleiche Dachformen **plus** Zusatzinfos (Wand/Dach getrennt, Nutzung, Höhe, oft Geschosse) |
| 2 | **topoexport 3D-DXF** (LoD2 als Netz) | gleiche Dachformen, aber ohne Zusatzinfos |
| 3 | LoD1 | nur Klötze |
| 4 | OSM-Grundriss × Geschosse | Schätzung |

Gibt es CityGML **und** topoexport-3D für dasselbe Gebäude, nimmt das Tool die Form aus der
Quelle mit mehr Dreiecken (also mehr Details) und die Zusatzinfos aus CityGML.

**Sofort-Test für Allplan 2024 und ArchiCAD 29:** Diese Datei ist schon ein echter Testfall für
unseren Export, weil sie dieselben 3D-Objekte (MESH) enthält, die wir später schreiben wollen.
Wenn du sie jetzt in beiden Programmen öffnest, wissen wir früh, ob MESH dort gut ankommt oder ob
wir besser einfachere 3D-Flächen (3DFACE) schreiben sollten.

## 4b-4. Erkenntnisse aus der CityGML-Beispieldatei (LoD2)

Untersucht: `LoD2_32_447_5888_1_ni.gml` vom Landesamt (LGLN). Ausgepackt 57 MB, als RAR nur 3,8 MB.

**Eckdaten**

| Merkmal | Befund | Bedeutung für das Tool |
|---|---|---|
| Format | **CityGML 1.0**, Profil der deutschen Vermessungsverwaltung (AdV) | Standardformat, das gleiche in ganz Deutschland |
| Kachel | **1 × 1 km**, Ost 447 000–448 000, Nord 5 888 000–5 889 000 (Oldenburg) | Der Dateiname verrät die Lage: `LoD2_32_<Ost-km>_<Nord-km>_1_ni` |
| Koordinaten | **ETRS89 / UTM 32**, Höhen in **NHN (DHHN2016)** | Echte Koordinaten, die Datei kann **automatisch** auf die Karte gelegt werden |
| Größe | 57 MB pro km² (ca. 15× kleiner als ZIP/RAR) | Das Tool muss gezippte Dateien annehmen und große Dateien im Hintergrund lesen |
| Inhalt | **1575 Gebäude**, davon 760 aus mehreren Teilen (2983 Gebäudeteile) | – |
| Höhen | gemessene Gebäudehöhe 0–48 m, typisch 10 m | passt zur topoexport-3D-Datei |

**Zusatzinfos pro Gebäude bzw. Gebäudeteil (der große Vorteil gegenüber topoexport):**

| Info | Beispiel | Nutzen im Tool |
|---|---|---|
| **Gebäudefunktion** (amtlicher ALKIS-Code, 34 verschiedene) | `31001_1000` Wohngebäude, `31001_2010` Handel/Dienstleistung, `31001_2310` Handel/Dienstleistung mit Wohnen, `51009_1610` Überdachung … | **Kennzahl „Gebäude nach Nutzung“** mit amtlichen Daten statt OSM. Die Codes übersetzen wir mit der offiziellen ALKIS-Codeliste in Klartext |
| **Dachform** (16 Arten) | Flachdach 2690, Satteldach 505, Krüppelwalmdach 198, Walmdach 146, Pultdach 90 … | **neu (Should): Diagramm „Dachlandschaft“** |
| Gemessene Höhe, Firsthöhe, Traufhöhe | 8,63 m / 14,04 m NHN | genaue Höhen für Kennzahlen und 3D |
| Bodenhöhe (NHN) | 5,41 m | Gebäude stehen richtig auf dem Gelände |
| Dachneigung, Dachorientierung, Dachfläche | 90°, 0°, 4,41 m² | Could: z. B. Dachflächen nach Ausrichtung (Solarpotenzial) |
| **Getrennte Flächen** | Wand (25 849), Dach (5776), Boden (3798), Verbindungsflächen zwischen Gebäudeteilen (6391) | Wand und Dach sind **schon getrennt**: direkt für die Export-Layer `GEBAEUDE_3D_WAND` und `_DACH` |
| Aktualität, Datenquelle, Lizenz | Grundriss 2017, Modell 2022, CC BY 4.0 | Quellenangabe und Hinweis zur Aktualität |

**Was fehlt:**
- **Keine Geschosszahl.** Das Tool schätzt sie weiter aus der Höhe (Traufhöhe ÷ ca. 3 m) und
  kennzeichnet sie als Schätzung.
- **Adressen:** nur der Ortsname „Oldenburg (Oldb), Stadt“. Es gibt keine Straßen und keine
  personenbezogenen Daten, also datenschutzrechtlich unproblematisch.
- Keine Fassadentexturen (Fotos).

**Wichtig: Ein Untersuchungsgebiet braucht oft mehrere Kacheln.** Das topoexport-Gebiet
(siehe unten) liegt zum Beispiel auf **vier** LoD2-Kacheln. Darum gilt:
- Das Tool nimmt **mehrere CityGML-Dateien auf einmal** an und fügt sie zusammen (Must).
- Das Tool sagt dir anhand des gewählten Rechtecks, **welche Kacheln du brauchst**, zum Beispiel
  `LoD2_32_446_5887`, `…_447_5887`, `…_446_5888`, `…_447_5888`. Nach dem Laden zeigt es an, welche
  noch fehlen und welche überflüssig sind (**Must**, siehe Test unten).
- Gebäude, die genau auf einer Kachelgrenze liegen, dürfen nicht doppelt gezählt werden (über die Gebäude-ID).

**Automatische Verortung: Test erfolgreich.** Ich habe die Gebäudegrundrisse der
topoexport-2D-Datei mit den CityGML-Gebäuden verglichen. Ergebnis:
- Die topoexport-Datei beginnt bei **Ost 446 885,3 / Nord 5 887 643,7** (UTM 32).
- Rund **900 Gebäude** passen auf weniger als 3 m genau. Das sind praktisch alle Gebäude im
  Überlappungsbereich der beiden Dateien.
- Damit ist bewiesen, dass die **automatische Verortung (Should) funktioniert**, sobald eine Datei
  mit echten Koordinaten (CityGML oder OSM) dabei ist. Die Verortung von Hand bleibt als Ersatz.

**Test mit vier Kacheln** (`447_5888`, `447_5887`, `448_5887`, `448_5888`):
- Größe ausgepackt 13–57 MB pro Kachel. Als ZIP sind sie über 90 % kleiner. ZIP bleibt also Pflicht.
- Das höchste Gebäude (**83 m**, Kachel `447_5887`) ist dasselbe wie in der topoexport-3D-Datei.
  Das bestätigt, dass die Verortung stimmt.
- **Abdeckung des topoexport-Gebiets:**
  - Die Kacheln `448_*` liegen **östlich außerhalb** des Gebiets und werden dafür nicht gebraucht.
  - Es fehlt ein **115 m breiter Streifen im Westen** (Kacheln `446_5887` und `446_5888`, ca. 265 Gebäude, ca. 15 %).
  - Für diesen Streifen nimmt das Tool die nächstbeste Quelle (topoexport-3D), genau wie die
    Detailstufen-Regel es vorsieht.
- **Lehre 1:** Welche Kacheln man braucht, ist ohne Hilfe leicht zu verwechseln. Darum wird
  „Tool zeigt die benötigten Kacheln an“ von Should zu **Must** hochgestuft.
- **Lehre 2:** Gebäude aus verschiedenen Quellen lassen sich nicht zuverlässig über ihren
  **Mittelpunkt** zuordnen. Nur ca. 68 % passten, weil ALKIS und LoD2 Gebäude manchmal
  unterschiedlich in Teile zerlegen. Das Tool ordnet darum über die **Überlappung der
  Grundflächen** zu: Was sich zu mehr als der Hälfte überdeckt, gilt als dasselbe Gebäude.

**Endgültige Detailstufen-Regel für Gebäude** (ersetzt die Tabellen in 4a und 4b-3):

| Rang | Quelle | Form | Zusatzinfos |
|---|---|---|---|
| 1 | **CityGML LoD2** | Dachform, Wand/Dach getrennt | Funktion, Dachform, Höhen |
| 2 | topoexport 3D-DXF | gleiche Dachform als Dreiecksnetz | keine |
| 3 | topoexport 2D-DXF (ALKIS-Grundriss) | nur Grundriss | keine |
| 4 | OSM | Grundriss | Nutzung, manchmal Geschosse |

Wenn mehrere Quellen dasselbe Gebäude enthalten, nimmt das Tool die Form vom höchsten Rang. Fehlende
Infos ergänzt es aus den anderen Quellen, z. B. die OSM-Nutzung, wenn CityGML keine Funktion hat.

## 4c. DXF-Export für CAD

**Ziel:** Der fertige Lageplan wird als DXF heruntergeladen und kann in **Allplan** oder
**ArchiCAD** direkt weiterbearbeitet werden, z. B. als Grundlage für einen Entwurf.

### Voreinstellungen für Allplan und ArchiCAD

Beim Export wählt man das Zielprogramm. Das Tool stellt dann alles passend ein:

| Einstellung | Allplan 2024 | ArchiCAD 29 |
|---|---|---|
| DXF-Version | eine ältere, sehr verbreitete Version (AutoCAD 2013), die beide sicher lesen | gleich |
| Einheit | Meter (in der Datei hinterlegt) | Meter (in der Datei hinterlegt) |
| Lage | **UTM 32** (echte Position). Allplan kommt mit großen Koordinaten gut zurecht | **lokaler Nullpunkt** (Standard). ArchiCAD arbeitet ungenau, wenn die Zeichnung sehr weit vom Nullpunkt liegt |
| Bezugspunkt | n/a | die echten UTM-Koordinaten des Nullpunkts stehen als Text in der Datei, damit man die Lage nachvollziehen kann |
| Layernamen | kurz, in Großbuchstaben, ohne Umlaute und Leerzeichen (z. B. `GEBAEUDE`) | gleich |
| 3D-Gebäude | 3D-Flächen, in Allplan als 3D-Elemente weiterbearbeitbar | 3D-Flächen/Netze, die ArchiCAD beim Einlesen in eigene 3D-Elemente umwandelt |

Zu jedem Zielprogramm gibt es im Tool eine **kurze Schritt-für-Schritt-Anleitung zum Einlesen**
(welches Menü, welche Import-Einstellungen), mit Screenshots aus unseren Tests.

**Noch zu prüfen beim Testen:** Wie genau Allplan und ArchiCAD die 3D-Flächen beim Import
übernehmen (welche Elementart daraus wird, ob Layerfarben und Linienstärken ankommen). Das hängt
auch von der Programmversion ab. Darum testen wir genau mit **Allplan 2024** und **ArchiCAD 29**.

**Was in der DXF-Datei steckt:**
- **Alle Ebenen des Lageplans**, und zwar die detailliertesten (gleiche Detailstufen-Regel wie im Tool).
- **Eine saubere Layerstruktur**, damit man im CAD Ebenen ein- und ausblenden kann, z. B.:

| Layer | Inhalt |
|---|---|
| `GEBAEUDE` | Gebäudeumrisse als geschlossene Polylinien (2D-Draufsicht) |
| `GEBAEUDE_NEBEN` | Nebengebäude und Überdachungen (2D und 3D) |
| `GEBAEUDE_3D_WAND` | Wandflächen der Gebäude in 3D |
| `GEBAEUDE_3D_DACH` | Dachflächen der Gebäude in 3D (bei LoD2 mit echter Dachform) |
| `GEBAEUDE_3D_ERSATZ` | 3D-Körper, die nur geschätzt sind (LoD1 oder OSM-Klotz), getrennt, damit man sie erkennt |
| `GELAENDE` | Geländehöhen, falls eine importierte Datei welche enthält |
| `STRASSE_HAUPT`, `STRASSE_NEBEN`, `STRASSE_WOHN`, `WEG_FUSS_RAD` | Straßen nach Kategorie |
| `GRUEN_PARK`, `GRUEN_WALD`, `GRUEN_WIESE` | Grünflächen |
| `BAUM` | Einzelbäume als Kreis-Symbol (Kronengröße) |
| `BAUM_3D` | Einzelbäume als 3D-Körper (Stamm und Krone) |
| `WASSER` | Gewässer |
| `GEBIET` | Umriss des Untersuchungsgebiets |
| `PARZELLEN` | Flurstücksgrenzen (wenn aus topoexport vorhanden) |
| `BAHN` | Bahnflächen und -achsen |
| `BESCHRIFTUNG` | Nordpfeil, Maßstabsleiste und Quellenangabe als Text |

- **Echte Maße in Metern (1 Zeicheneinheit = 1 m)**, damit man im CAD sofort richtig messen kann.

**Alle 3D-Daten bleiben erhalten:**
- **Gebäude:** Jedes Gebäude kommt als echter 3D-Körper aus Wand- und Dachflächen in die Datei.
  In der Draufsicht sieht man den Lageplan, in der 3D-Ansicht des CAD-Programms das Stadtmodell.
- **LoD2 aus CityGML:** Alle Wände und Dachflächen werden 1:1 übernommen, mit echter Dachform.
- **Importierte DXF/DWG mit Höhen:** Höhenwerte (Z-Koordinaten) und 3D-Objekte werden nicht
  „plattgedrückt“, sondern unverändert weitergegeben.
- **Ersatz-Gebäude ohne LoD2:** kommen als einfacher Klotz in die Datei, auf einem eigenen Layer.
- **Höhenbezug:** Liegen echte Höhen vor (z. B. über Normalhöhennull, NHN, aus den amtlichen Daten), bleiben sie
  so erhalten. Sonst steht das Gelände auf 0 m. Welcher Bezug gilt, steht im Layer `BESCHRIFTUNG`.
- **Gelände und Bäume:** Das Geländemodell (Layer `GELAENDE`) und die 3D-Bäume (Layer `BAUM_3D`)
  aus der topoexport-3D-Datei kommen ebenfalls mit.
- **Technisch:** Die Flächen werden als 3D-Netze („MESH“, wie bei topoexport) oder als einfache
  3D-Flächen („3DFACE“) geschrieben. Welche Art wir nehmen, entscheidet der Test der
  topoexport-3D-Datei in Allplan 2024 und ArchiCAD 29 (siehe 4b-3).

**Lage der Zeichnung (Koordinaten):** Zwei Möglichkeiten (Standard je nach Zielprogramm, siehe oben):
- **UTM 32 (Standard):** Die Zeichnung liegt an ihrer echten Position, passend zu amtlichen Daten
  und anderen Plänen aus Niedersachsen.
- **Lokaler Nullpunkt:** Die Zeichnung beginnt bei 0/0 in der Ecke des Gebiets. In manchen
  CAD-Programmen ist das angenehmer, weil die Zahlen klein bleiben.

**Was nicht hineinkommt:** Diagramme und Kennzahlen (die gibt es als Bild bzw. Tabelle).
Die Quellenangabe (© OpenStreetMap-Mitwirkende und die anderen Quellen) steht als Text im
Layer `BESCHRIFTUNG`, weil die Lizenz das verlangt.

**Testen:** Jede Änderung am Export wird geprüft:
1. kurz in einem kostenlosen DXF-Betrachter (geht schnell),
2. dann **in Allplan und in ArchiCAD**: Datei einlesen, Draufsicht prüfen, 3D-Ansicht prüfen,
   Layer prüfen und ein Maß nachmessen (stimmt 1 m = 1 m?).

## 5. Wie das Tool technisch funktioniert (einfach erklärt)

- **Eine Website**, die im Browser läuft. Man braucht keine Installation und keinen Server.
- **Karte:** eine fertige Kartenbibliothek (*MapLibre*), die auch 3D darstellen kann.
- **Daten:** Die Website fragt die kostenlose OSM-Schnittstelle (*Overpass*) nach allem im Rechteck.
- **Zusatzdateien:** Man zieht sie per Drag & Drop auf die Seite. Hilfsbibliotheken lesen DXF, DWG
  und CityGML. Eine weitere (*proj4*) rechnet die Koordinaten um. Für die 3D-Ansicht mit
  LoD2-Dächern kommt *three.js* hinzu.
- **DXF-Export:** Eine Hilfsbibliothek schreibt die DXF-Datei, und *proj4* rechnet die Koordinaten
  zurück in Meter (UTM 32).
- **Rechnen:** Eine Mathe-Bibliothek (*Turf*) berechnet Flächen und Längen.
- **Diagramme:** eine fertige Diagramm-Bibliothek (*Chart.js*).
- **Grenze:** Das Gebiet ist auf etwa **1 km²** begrenzt, damit das Laden schnell bleibt und der kostenlose
  Dienst nicht überlastet wird.
- **Veröffentlichen:** GitHub Pages macht aus dem Projektordner eine Website.

Geplanter Projektordner:
```
ortsanalyse/
├── CLAUDE.md      Regeln für die Zusammenarbeit
├── PLAN.md        dieser Plan
├── README.md      Erklärung für Besucher (am Ende)
├── index.html     die Seite
├── style.css      das Aussehen
└── app.js         die Logik
```

## 6. Reihenfolge der Arbeitsschritte

1. **Idee und Plan:** PLAN.md und CLAUDE.md stehen ✅
2. **Grundgerüst und Aussehen** ✅: Seite mit der Karte von Oldenburg, Rechteck aufziehen, Layout im
   Architektur-Look (Platzhalter für Pläne und Kennzahlen).
3. **Datenquellen prüfen:** topoexport und LoD2 prüfen, Testdateien für Oldenburg herunterladen.
4. **OSM-Daten und 2D-Pläne:** Schwarzplan, Straßennetz, Grün und Lageplan erscheinen; Kennzahlen
   werden berechnet.
5. **Datei-Import und Detailstufen-Regel:** zuerst CityGML und DXF, danach DWG.
6. **3D-Modell mit LoD2.**
7. **Diagramme und PNG-Export.**
8. **DXF-Export für CAD:** zuerst 2D, dann alle 3D-Daten. Getestet in Allplan und ArchiCAD,
   dazu die Anleitungen zum Einlesen.
9. **Veröffentlichen:** online auf GitHub Pages.
10. **Polieren und präsentieren:** README, Poster, Präsentation.

Abgabe: Projekt auf GitHub (mit README) und Poster.

Rhythmus pro Feature: **neue Sitzung → ein Feature bauen → testen und speichern → Stand hier eintragen.**

## 7. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Geschosszahlen fehlen in OSM oft | Ersatzwert und deutliche Kennzeichnung im Tool („x % geschätzt“) |
| OSM-Dienst langsam oder überlastet | Gebietsgröße begrenzen; Testdaten für Oldenburg lokal speichern |
| Vier Must-Ebenen sind viel | 3D-Modell zuletzt bauen; Schwarzplan, Straßen und Grün zuerst |
| Lizenz | Quellenangabe „© OpenStreetMap-Mitwirkende (ODbL)“ und die Angaben der Zusatzquellen in jedem Plan und Export |
| DWG lässt sich im Browser nicht zuverlässig lesen | Anleitung zur Umwandlung in DXF im Tool; DXF und CityGML zuerst bauen, DWG zuletzt |
| CityGML-Dateien sehr groß (**bestätigt**: 57 MB pro km²) | im Hintergrund lesen, damit die Seite nicht einfriert; nur Gebäude im gewählten Rechteck übernehmen; Fortschrittsanzeige; ZIP-Dateien annehmen (Must), RAR (Should) |
| Gebiet liegt auf mehreren CityGML-Kacheln (**bestätigt**: topoexport-Gebiet = 4 Kacheln) | mehrere Dateien auf einmal laden, doppelte Gebäude über die ID entfernen, benötigte Kacheln anzeigen |
| Gebäudefunktion nur als Code (z. B. `31001_2010`) | offizielle ALKIS-Codeliste ins Tool einbauen und in Klartext übersetzen |
| CAD-Datei ohne Koordinatensystem oder mit lokalen Koordinaten (**bei topoexport bestätigt**) | Verortung von Hand per Verschieben (Must), automatisch per Gebäudevergleich (Should, **im Test erfolgreich**: ca. 900 Gebäude auf < 3 m genau) |
| Binäre DXF (topoexport) wird von der Lese-Bibliothek nicht unterstützt | Bibliothek mit Binär-Unterstützung wählen. Sonst eigenes kleines Leseprogramm, das Format ist einfach aufgebaut |
| Höhenangaben in DXF sind Platzhalter (topoexport: alle „H 6.0 m“) | Höhen nie aus diesem Text übernehmen, nur aus LoD2 oder OSM |
| DXF mit allen 3D-Daten wird sehr groß und langsam im CAD | Gebiet auf ca. 1 km² begrenzt; Größe der Datei vor dem Download anzeigen |
| Allplan oder ArchiCAD lesen 3D-Flächen anders ein als erwartet | früh mit einer kleinen Testdatei in beiden Programmen prüfen, bevor der ganze Export fertig ist |
| ArchiCAD wird ungenau bei großen Koordinaten | für ArchiCAD standardmäßig lokaler Nullpunkt |
| Kein Zugang zu Allplan/ArchiCAD beim Testen (ich kann die Programme nicht selbst öffnen) | du testest im Rechnerpool bzw. auf deinem Laptop und schickst mir Screenshots oder Fehlermeldungen |
| Import klappt bei einer Datei nicht | OSM bleibt immer als Ersatz, das Tool läuft trotzdem |
| topoexport kostenpflichtig oder nur von Hand nutzbar | Datei-Import statt automatischem Abruf; im Notfall nur amtliche Open Data verwenden |
| Import und LoD2 machen das Projekt deutlich größer | Reihenfolge: zuerst OSM-Pläne, dann Import, LoD2-3D zuletzt |

## 8. Aktueller Stand und nächster Schritt

- [x] Interview geführt, Plan geschrieben
- [x] Ergänzt: Zusatzdaten (topoexport), LoD2-Gebäude, Detailstufen-Regel für den Lageplan
- [x] Import-Formate festgelegt: DXF, DWG, CityGML (Abschnitt 4b)
- [x] DXF-Export für CAD geplant, inklusive aller 3D-Daten (Abschnitt 4c)
- [x] Zielprogramme festgelegt: Allplan und ArchiCAD
- [x] Versionen geklärt: Allplan 2024 und ArchiCAD 29
- [x] topoexport-Beispieldatei (2D-DXF) und Lizenz ausgewertet (Abschnitt 4b-2)
- [x] topoexport-Beispieldatei (3D-DXF) ausgewertet: LoD2-Gebäude, Gelände, 3D-Bäume (Abschnitt 4b-3)
- [ ] **Offen (früh testen):** topoexport-3D-Datei in Allplan 2024 und ArchiCAD 29 öffnen. Kommen
  Gebäude, Gelände und Bäume in 3D an? Wie lange dauert das Einlesen? Welche Elementart entsteht?
- [x] CityGML-Beispieldatei (LoD2) ausgewertet (Abschnitt 4b-4)
- [x] Automatische Verortung getestet: topoexport-Gebiet beginnt bei Ost 446 885,3 / Nord 5 887 643,7
- [x] Letzte Fachfragen geklärt: Analysegebiet, brutto/netto, Maßstab, Nebengebäude, Demo-Daten, 3D-Bild
- [x] Weitere Kacheln erhalten und getestet: `447_5887` (benötigt), `448_5887` und `448_5888` (liegen außerhalb, aber gut zum Testen mehrerer Kacheln)
- [ ] Optional: Kacheln `LoD2_32_446_5887` und `LoD2_32_446_5888` für den westlichen Randstreifen
  (ca. 15 % des Gebiets). Ohne sie greift dort automatisch topoexport-3D.
- [ ] Offen: DWG-Beispieldatei besorgen
- [ ] Offen: Zeigt topoexport die Lage (Koordinaten) des Ausschnitts an? Gibt es eine Export-Option mit UTM 32?
- [ ] Offen: Ist topoexport für uns kostenlos, und darf man es automatisch abfragen?
- [x] **Grundgerüst fertig** (`index.html`, `style.css`, `app.js`): Karte von Oldenburg in Grautönen,
  Rechteck aufziehen (Breite × Höhe und Fläche werden angezeigt, Warnung über 1 km²), Nordpfeil,
  Maßstabsleiste, Quellenangabe, Reiter für alle Ansichten (noch Platzhalter), Knopf „Analysieren“
  (noch ohne Funktion), Ablagefeld für Dateien (noch ohne Funktion). Im Browser getestet, auch in Handybreite.
- [x] **OSM-Daten und 2D-Pläne** (Branch `feature-osm-2d-plaene`, nur lokal committet, nicht gepusht):
  „Analysieren“ lädt Gebäude, Straßen, Grün, Gewässer und Einzelbäume per Overpass-API und
  zeichnet Schwarzplan (schwarz auf weiß, Nebengebäude grau), Straßennetz (Linienstärke nach Straßenart),
  Grün (inkl. Wasser und Bäume) und Lageplan (alles zusammen). Die fünf Kartenreiter nutzen dieselbe Karte,
  außerhalb des Rechtecks ist alles weiß abgedeckt. Neue Bibliothek: osmtogeojson 3.0.0-beta.5 (CDN).
  Zwei Overpass-Server als Ersatz füreinander, Ladeanzeige, verständliche Fehlermeldung.
  **Getestet** im Browser mit **echten** OSM-Daten (Oldenburg Innenstadt, ca. 0,19 km², 424 Gebäude,
  181 Straßenabschnitte, 185 Bäume): alle vier Pläne zeichnen, Wechsel zurück zur Karte, Fehlerfall mit
  absichtlich falschen Serveradressen. **Nicht getestet:** Handybreite, Gebiete bis 1 km², zweiter Overpass-Server
  (war vom Testrechner aus nicht erreichbar), Firefox/Safari.
  **Beobachtung:** Der Overpass-Server war langsam (ca. 60 s für das Testgebiet). Darum Zeitlimit 75 s.
  Der Knopf „Beispiel Oldenburg laden“ (Demo-Daten fest eingebaut) wäre dafür die Absicherung.
  **Offen in diesem Schritt:** Fußgängerzonen sind nur dünne Linien (Straßentyp „fuss“); Kennzahlen folgen separat.
- [x] **Tempo und Datenprüfung** (Branch `feature-osm-2d-plaene`, nur lokal):
  Das Tool fragt jetzt drei Overpass-Server gleichzeitig, der erste mit Daten gewinnt, die anderen werden
  abgebrochen. Im Lageplan sind Gebäude jetzt hell mit feinem Umriss statt schwarz (Platzhalter, bis LoD2-Dachformen da sind).
  **Getestet** mit echten Daten (gleiches Gebiet wie oben): Antwort nach ca. 43 s, Server 1 gewann, Server 2 und 3
  antworteten in dieser Zeit nicht (einer meldete 502). **Das Laden ist damit kaum schneller geworden**,
  weil der Haupt-Server selbst langsam ist. Nur ein fest eingebautes Oldenburg-Beispiel oder ein Zwischenspeicher
  würde das Warten ersetzen (bisher nicht gewählt).
  **Prüfung Zusatzdaten (nur Recherche, nicht belegt):**
  - topoexport ist eine Web-Oberfläche mit Handauswahl, eine Abruf-Schnittstelle (API) wurde nicht gefunden: Datei-Import bleibt der Weg.
  - LGLN-LoD2 (CityGML) ist frei (CC BY 4.0 laut LGLN-Präsentation, Quellenvermerk „© GeoBasis-DE/LGLN Jahr“).
    **Automatischer Abruf geht (gefunden und getestet):** Der LGLN hat eine offizielle Suchschnittstelle (STAC):
    `https://lod.stac.lgln.niedersachsen.de/search?collections=lod2&bbox=West,Süd,Ost,Nord`
    liefert die benötigten Kacheln samt Download-Adresse, z. B.
    `https://lod2.s3.eu-de.cloud-object-storage.appdomain.cloud/LoD2_32_447_5888_1_ni.gml` (ca. 57 MB, Stand der Kachel 03.09.2024).
    Für das Oldenburger Testgebiet liefert die Suche die Kacheln `447_5888` und `447_5887`.
    **Getestet aus dem Browser:** Suche und Teil-Download (HTTP 206, 200 KB per Range-Anfrage) klappen ohne Fehler (CORS offen).
    **Ungeprüft:** vollständiger Download einer Kachel (57 MB) im Browser, Einlesen der CityGML-Datei (Dauer, Speicher),
    Kachelnamen für Randgebiete (z. B. `446_…`).
    Die Kachel ist ein CityGML-Dokument pro km², die Gebäude im Rechteck müssen wir herausfiltern (Aufgabe für den Import-Schritt).
    Zusätzlich gibt es pro Kachel ein Shape-ZIP (`…/SHP/LoD2_…ni.zip`), das ist eine Alternative zum Einlesen.
  - Offen: ALKIS-Gebäude per WFS und Luftbild (Lizenz) nicht geprüft.
- [x] **LoD2-Dachformen im Lageplan** (Branch `feature-osm-2d-plaene`, nur lokal):
  Haken „LoD2-Dachformen laden“ (standardmäßig an). Nach „Analysieren“ sucht das Tool über die LGLN-Schnittstelle (STAC)
  die Kacheln, lädt sie in einem Hintergrundprogramm (`lod2-worker.js`, Datenstrom, nur Gebäude im Rechteck) parallel zu den
  OSM-Daten, rechnet UTM 32 mit proj4 um und färbt jede Dachfläche nach Neigung und Himmelsrichtung (Licht von Nordwesten).
  Wo LoD2 ein Gebäude hat, ersetzt es im Lageplan die helle OSM-Fläche (Zuordnung: Mittelpunkt einer Dachfläche liegt im OSM-Gebäude).
  Schwarzplan, Straßennetz und Grün sind unverändert. Quellenvermerk „© GeoBasis-DE/LGLN 2024, Daten geändert“ wird angezeigt.
  **Getestet** im Browser mit echten Daten (Oldenburg Innenstadt): 2 Kacheln = 97 MB in ca. 6 s geladen, kein Hängen der Seite
  (gemessen), Rechteck 167 × 167 m: 103 Gebäude mit 585 Dachflächen, 86 von 88 OSM-Gebäuden ersetzt; Rechteck außerhalb
  Niedersachsens (Hamburg) meldet „keine Daten“. Lageplan zeigt sichtbar First- und Traufkanten.
  **Nicht getestet:** 1 km² (bis zu 4 Kacheln = ca. 230 MB, Speicher und Dauer unbekannt), Handy, andere Browser, Fehlerfall
  LGLN-Server ausgefallen (nur der Code-Pfad), Gebäude auf Kachelgrenzen.
  **Beobachtungen:** (1) Overpass war im Test wiederholt überlastet (502); bei Fehler von OSM wird LoD2 verworfen, obwohl es
  nach ca. 8 s da wäre. (2) Der Plan zeigt LoD2 erst, wenn OSM fertig ist. Idee: Mit LoD2-Grundrissen schon nach wenigen Sekunden
  einen Schwarzplan zeigen (nur Niedersachsen) und OSM danach ergänzen. (3) Kacheln könnten im Browser zwischengespeichert werden.
  **Hinweis zum Start:** Das Hintergrundprogramm läuft nur über einen Webserver (GitHub Pages oder lokal), nicht per Doppelklick auf `index.html`.
- [x] **Genaue Straßen aus amtlichen Flächen (ALKIS)** (Branch `feature-osm-2d-plaene`, nur lokal):
  Nach „Analysieren“ fragt das Tool den offenen LGLN-Abrufdienst (WFS `alkis_wfs_sf`) nach `AX_Strassenverkehr`
  (Fahrbahn), `AX_Weg` (Wege, Gehwege) und `AX_Platz` (Plätze) ab, liest die GML-Antwort im Browser und zeichnet
  nachgezeichnete Flächen statt dünner Linien (Straßennetz: Fahrbahn dunkel, Wege/Plätze hell; Lageplan: ruhige Grautöne).
  Wo ALKIS-Flächen da sind, verschwinden die OSM-Straßenlinien. Außerhalb Niedersachsens oder bei Ausfall bleiben die Linien.
  **Abweichung vom Plan:** Die OSM-Gehwege als Flächen waren nicht nötig. Das Kataster trennt Fahrbahn und Gehweg
  (`AX_Weg`) selbst (im Test sichtbar). Fußgängerzonen (Funktionscode 5130 laut ATKIS-Katalog, für ALKIS **nicht bestätigt**)
  zeichnen wir wie Plätze. Die Bedeutung weiterer Codes (2312, 5220 bis 5250) ist **nicht entschlüsselt**.
  **Zusätzlich umgebaut:** Amtliche Straßenflächen, LoD2-Dächer und OSM werden jetzt unabhängig voneinander angezeigt, sobald
  jede Quelle fertig ist. Im Test standen Straßen und Dächer nach ca. 9 Sekunden, während Overpass noch lud (oder ausfiel).
  **Getestet** (echte Daten, Oldenburg Innenstadt, zwei Gebiete à 7 bis 8 ha): Fahrbahn und Gehwege getrennt sichtbar in
  Straßennetz und Lageplan; Gebiet in Hamburg meldet „keine Daten“. ALKIS-Abfrage dauert unter 1 s je Art.
  **Nicht getestet:** 1 km² (Obergrenze 3000 Flächen je Art: bei Erreichen Hinweis), Handy, andere Browser,
  Ausfall des LGLN-Dienstes (nur Code-Pfad), gesamter Ablauf mit OSM zusammen für das neue Gebiet (Overpass war wieder
  überlastet, 502). Der Quellenvermerk nennt als Jahr das Abrufjahr (2026), nicht das Stand-Jahr der Flächen.
- [x] **Kennzahlen** (Branch `feature-osm-2d-plaene`, nur lokal): Reiter „Kennzahlen“ mit Gebiet, Gebäude, Dichte (GRZ/GFZ brutto
  und netto), Verkehr (amtliche Flächen, Straßenlänge nach Art), Grün und Wasser, Flächenanteilen, Nutzung, Dachlandschaft,
  Hinweisen zur Genauigkeit und Knopf „Kennzahlen als Text kopieren“. Alle Zahlen gelten für das Rechteck (Flächen und Längen am Rand
  abgeschnitten, Anzahlen nach Mittelpunkt). Überlappungen werden über ein unsichtbares Raster (1 Pixel = 1 m) entfernt.
  Geschosse: OSM `building:levels`, sonst LoD2-Traufhöhe über Gelände geteilt durch 3 m, sonst Ersatzwert 3 (im Hinweis ausgewiesen).
  Gebäude mit amtlichem Code `51009_…` zählen jetzt als Nebengebäude (auch in der Karte grau).
  **Getestet** (echte Daten, Oldenburg Innenstadt, 19 ha und 97 ha): Werte plausibel, bebaute Fläche per Polygon (266.570 m²) und
  per unabhängiger Rasterzählung (266.511 m²) stimmen überein; Teilstände (ohne OSM) zeigen Hinweise statt Fehler.
  **Nicht geprüft / Grenzen:** Schlüsselnummern für Nutzung und Dachformen sind aus dem AdV-Standard übernommen und nicht gegen die
  offizielle Liste geprüft; Bahnflächen und Flurstücke fehlen (Netto-Werte eher zu klein); Handy; andere Browser.
  **Tempo-Fund:** Der Overpass-Server `overpass.openstreetmap.fr` lieferte im Test das Testgebiet in ca. 4 s (der Haupt-Server brauchte
  40 bis 60 s oder fiel aus). Er steht jetzt vorn in der Serverliste. Das Gesamtladen (OSM + ALKIS + LoD2) für ca. 1 km² dauerte ca. 29 s.
  **Start der Seite:** nur über einen Webserver, per `Start.bat` (Doppelklick) oder Vorschau-Eintrag `.claude/launch.json` (beide noch nicht committet).
- [x] **Bäume als Kronen** (Branch `feature-osm-2d-plaene`, nur lokal): Statt gleicher Kreise zeichnet das Tool je Baum eine leicht
  unregelmäßige Krone (Größe und Form fest pro Baum, Zufall aus der OSM-Nummer) mit Stammpunkt, im Reiter Grün und im Lageplan
  (über den Dächern, durchscheinend); Nadelbäume als gezackte Form. Größe: 1. OSM-Kronendurchmesser, 2. OSM-Höhe (Krone ca. halbe Höhe),
  3. Standardwert mit Streuung (Annahme, keine Messung). Neu: OSM-Baumreihen (`natural=tree_row`) als Bäume alle ca. 9 m;
  amtliche Gehölz- und Waldflächen (ALKIS `AX_Gehoelz`, `AX_Wald`) als Grünflächen; Kennzahl „Kronenüberdeckung“.
  **Datenlage (gemessen):** Im Testgebiet (185 OSM-Bäume) hatte kein Baum einen Kronendurchmesser, 80 eine Höhe, 158 den Blatttyp;
  Größen sind also fast immer geschätzt. Einen offenen Baumkataster für Oldenburg habe ich nicht gefunden.
  **Getestet** (echte Daten): Innenstadt/Schlossteich (172 Bäume, Kronen 3 bis 9,6 m), Wohngebiet mit Baumreihen und Wald (ALKIS: 2 Flächen),
  Reiter Grün, Lageplan, Kennzahlen ohne Fehler. **Nicht geprüft:** echte Kronenform (nur künstlich), Handy, größere Gebiete mit vielen Bäumen (Tempo).
- [x] **3D-Modell** (Branch `feature-osm-2d-plaene`, nur lokal): Neuer Code in `ansicht3d.js` (three.js 0.147 per CDN, Maussteuerung OrbitControls).
  Gebäude aus LoD2 mit echten Wänden und Dachflächen (das Hintergrundprogramm liest jetzt auch `WallSurface` und `ClosureSurface`,
  Flächen werden in Dreiecke zerlegt), Gebäude ohne LoD2 als bläuliche Blöcke aus dem OSM-Grundriss (Geschosse mal 3 m; Nebengebäude 3 m),
  flacher Boden mit dem Lageplan als Bild (amtliche Straßenflächen, Grün, Wasser, Rahmen des Gebiets), Bäume als Stamm plus Kugel-/Kegelkrone
  (gebündelt). Knöpfe: Ansicht zurücksetzen, Draufsicht (Norden oben), Bäume ein/aus, Bild speichern (PNG mit Quellenangabe).
  **Getestet** (echte Daten): 19 ha Innenstadt (523 LoD2-Gebäude, 34.000 Dreiecke, Bauzeit ca. 1 s), 91 ha (1.522 Gebäude, 97.000 Dreiecke,
  Bauzeit ca. 0,2 s, 992 Bäume), Drehen mit der Maus, Draufsicht, Bäume-Schalter, PNG-Erzeugung (Download durch Abfangen geprüft, nicht gespeichert),
  Gebiet in Hamburg ohne LoD2 (nur Blöcke, Hinweis). **Nicht getestet:** Handy/Touch-Bedienung, andere Browser, Bildwiederholrate auf schwacher
  Grafik (nur auf Intel Iris gemessen), Lücken oder Überschneidungen bei komplexen Dächern (nur Stichproben angesehen).
  **Bewusst weggelassen:** Schatten und Sonnenstand, Geländehöhen (Boden flach, Höhe = Median der LoD2-Geländehöhen), Texturen, CAD-Export.
  **Fehler gefunden und behoben:** Im Hintergrundprogramm war der Ausdruck für Traufhöhe und Geländehöhe falsch geschrieben (nie gefunden).
  Die Kennzahlen nahmen deshalb vorher die Gebäudehöhe (First) statt der Traufhöhe als Geschosshöhe. Seit der Korrektur: mittlere Geschosszahl im
  91-ha-Gebiet 3,2 (vorher ca. 3,6 in einem anderen Gebiet), GFZ brutto 1,07. Die früher in diesem Plan genannten Werte (GFZ 1,23 und 2,28)
  sind damit zu hoch gewesen.
- [x] **Legende und Farben** (Branch `feature-osm-2d-plaene`, nur lokal): Neue Datei `legende.js`. In jedem Karten-Reiter und im 3D gibt es eine
  ein- und ausblendbare Legende (Knopf „Legende“, Zustand wird im Browser gemerkt; auf niedrigen Bildschirmen startet sie zugeklappt) mit
  Farbschlüssel der sichtbaren Ebenen und Eckdaten aus den Kennzahlen (z. B. Gebiet, Gebäude, GRZ/GFZ, Verkehr, Grün, Kronenüberdeckung, im 3D
  Anzahl LoD2/Ersatz, höchstes Gebäude) plus Quellenangabe. Alle Farben stehen jetzt zentral in `FARBE` (app.js) und werden von Karte, Legende
  und 3D gelesen. Überarbeitet: Grün (kräftiger), Wasser (klareres Blau), Baumkronen (dunklerer Rand), Lageplan (mehr Kontrast bei Dächern,
  Fahrbahn kühl-grau, Gehweg und Platz warm-sandfarben), 3D (helle Wände, wärmere dunklere Dächer, kräftigerer Boden). Schwarzplan unverändert.
  **Getestet** (echte Daten, Oldenburg): Legende in Karte, Schwarzplan, Straßennetz, Grün, Lageplan und 3D, Zuklappen und Öffnen, Merken.
  **Nachjustiert nach Rückmeldung:** Lageplan-Dächer kontrastreicher (dunkler und engerer Hell-Dunkel-Bereich), Fahrbahn bläulich-grau,
  Wege kräftiger sandfarben, Plätze heller; Wasser dunkler blau; 3D-Dächer neutral grau, Ersatzblöcke deutlicher bläulich. Grün blieb unverändert.
  **Nicht geprüft:** Ob die neuen Farben dir gefallen (Geschmackssache, bitte ansehen), Handy, Farbsehschwäche. Die Eckdaten sind die Kennzahlen,
  also mit denselben Einschränkungen (siehe oben).
- [x] **Gelände im 3D** (Branch `feature-osm-2d-plaene`, nur lokal): Neue Datei `gelaende.js` (GeoTIFF-Bibliothek geotiff.js 2.1.3 per CDN).
  Das Tool sucht über `https://dgm.stac.lgln.niedersachsen.de/search` die Kacheln des 1-m-Höhenmodells (DGM1, pro Kachel die neueste Ausgabe),
  liest per Teil-Anfrage nur das Stück des Rechtecks (meist unter 2 MB), setzt mehrere Kacheln zusammen und füllt Lücken. Im 3D gibt es jetzt
  ein Höhenrelief (ca. 300 × 300 Punkte) mit dem Lageplan als Bild, Schummerung (verstärkt: Neigung mal 3, nur zur Lesbarkeit), Höhenlinien
  (Abstand automatisch 1, 2, 5 oder 10 m, ein- und ausschaltbar), Überhöhung 1 bis 5× (nur Gelände, Gebäude werden mitgehoben und behalten
  ihre Höhe). LoD2-Gebäude behalten ihre absoluten Höhen (NHN), Wandfüße sitzen 1 m unter dem Boden, OSM-Ersatzblöcke und Bäume stehen auf dem
  Gelände. Kennzahlen: Geländehöhe und Höhenunterschied; Legende und Quellenangabe „Gelände: © GeoBasis-DE/LGLN <Jahr>, Daten geändert“.
  **Getestet** (echte Daten): Oldenburg Innenstadt (1,5 bis 7,8 m, 2 Kacheln, Ausgabe 2021; 4-fach überhöht geprüft), Bad Harzburg 42 ha
  (251 bis 291 m, 4 Kacheln, Ausgabe 2018, 3D-Bauzeit 2,2 s, Gebäude und Bäume sitzen sichtbar auf dem Hang), Hamburg (keine Höhendaten: flacher
  Boden, Hinweis, Regler ausgeblendet).
  **Nicht getestet:** Gebiete bis 1 km² mit starkem Relief (Tempo, Speicher), Handy, andere Browser, Genauigkeit der Höhenlinien (nur angesehen),
  Spalten am Gebäudefuß bei sehr steilen Hängen (nur ein Hang gesehen). Gelände (Ausgaben 2015 bis 2021) und Gebäude (2024) stammen aus
  verschiedenen Erhebungen.
- [x] **Ladestand, Ladekreise und robusteres LoD2-Laden** (Branch `feature-osm-2d-plaene`, nur lokal):
  Neue Datei `ladeleiste.js`. In der Seitenleiste (zwischen Datei-Import und „Beispiel Oldenburg“) zeigt der „Ladestand“ je Quelle (OpenStreetMap,
  LoD2, amtliche Straßenflächen, Gelände) den Zustand und darunter, was genau geholt wird: die vier Overpass-Server, die einzelnen
  LoD2-Kacheln mit geladenen und gesamten MB und Fortschrittsring, die fünf ALKIS-Abfragen, die Geländekacheln. Hinter jeder Zeile steht ein kleiner
  Ladekreis (dreht sich, füllt sich, dann Haken oder Kreuz). Ein dünner Gesamtstreifen über den Reitern zeigt den Gesamtfortschritt
  (OpenStreetMap meldet keinen Fortschritt, dort läuft nur der Kreis).
  **Ursache für „LoD2 fehlt“ (nicht sicher belegt):** Im Test hing der LoD2-Download einmal ca. 25 s ohne Daten und lief dann nach einem neuen Versuch
  sofort durch. Vorher gab es weder Zeitüberschreitung noch neuen Versuch, das Tool wartete einfach. Jetzt: Abbruch nach 15 s ohne neue Daten, bis zu drei
  Versuche je Kachel, drei Versuche bei der Kachelsuche, Hinweis im Ladestand und Knopf „Nochmal versuchen“. Zweite mögliche Ursache: Beim Entwickeln lieferte der
  Standard-Webserver alte Dateien aus dem Zwischenspeicher des Browsers (Mischstände). Darum gibt es jetzt `server.py` (sendet „nicht zwischenspeichern“), den
  `Start.bat` und `.claude/launch.json` benutzen. Gebiete über 1 km² lassen sich nicht analysieren (Knopf gesperrt, Hinweis im Seitenfeld).
  **Getestet** (echte Daten): 4 LoD2-Kacheln (194 MB) + 4 Geländekacheln, normaler Ablauf mit Ladestand, Overpass-Server-Ausfall (502) sichtbar,
  künstlicher Ausfall der Kachelsuche mit „Nochmal versuchen“. **Nicht getestet:** Abbruch bei Stillstand im Worker (nur Code), Handy, andere Browser,
  ob der Fehler beim Nutzer damit weg ist.
- [x] **Reiter „Flurstücke“ mit Bodenrichtwert und Bestand** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**): Neue Datei `flurstuecke.js`.
  Daten (beide frei, vom LGLN, gleichzeitig mit den anderen Quellen geladen): Flurstücke aus dem ALKIS-Dienst (`AX_Flurstueck`, mit amtlicher Fläche,
  Gemarkung, Flur, Nummer) und Bodenrichtwertzonen aus dem BORIS-Dienst (`https://opendata.lgln.niedersachsen.de/doorman/noauth/boris_wfs`,
  `BR_BodenrichtwertZonal`, Stichtag 01.01.2026: Wert €/m², Nutzung z. B. MK, Bauweise, Richtwert-GFZ, Zonenname).
  Der **Grundsteuer-Viewer** hat keine Schnittstelle; er zeigt dieselben Richtwerte, deshalb laden wir sie direkt und verlinken Viewer und BORIS.NI im Infofeld.
  Der Reiter färbt die Flurstücke nach Bodenrichtwert, GRZ oder GFZ (Umschalter), Gebäude liegen halbtransparent darüber. Klick auf ein Flurstück zeigt:
  Fläche, Richtwert mit Zone, Nutzung, Bauweise, Richtwert-GFZ, Bodenwert (Fläche mal Richtwert, nur Orientierung), Bestand (Gebäude, bebaute Fläche, GRZ,
  GRZ inkl. Nebengebäude, Geschossfläche, GFZ, Ø Geschosse, Verhältnis zur Richtwert-GFZ). Legende mit Eckdaten, darunter **GRZ/GFZ netto**
  (nur Flurstücke ohne Verkehrsfläche und ohne Randflurstücke).
  **Regeln:** (1) Zonenwahl bei Überlagerung: Zone, die das Flurstück zur Hälfte oder mehr bedeckt; Bauland (Zustand B/R) vor Landwirtschaft; dann die
  kleinste Zone. Grund: im Testgebiet liegen unter der Innenstadt eine Außenbereichszone (4.800 ha) und eine Acker- und Grünlandzone (je 9.400 ha); mit
  „größte Überlappung“ bekam ein Innenstadt-Flurstück fälschlich 6 €/m². (2) Verkehrsflächen: Flurstück gilt als Verkehr, wenn sein innerer Punkt in einer
  amtlichen Straßen-, Weg- oder Platzfläche liegt; dort kein Richtwert, kein Bestand. (3) Bestand: OSM-Gebäude (mit Geschossen aus OSM, sonst LoD2-Traufhöhe
  durch 3 m, sonst 3) werden anteilig nach Überlappung auf die Flurstücke verteilt; Nebengebäude (OSM oder amtlicher Code 51009) getrennt. GFZ = Grundfläche
  mal Geschosse (Näherung, echte GFZ zählt Vollgeschosse). (4) Randflurstücke (ragen aus dem Rechteck) werden im Infofeld gewarnt und fehlen in GRZ/GFZ-Färbung
  und netto.
  **Nicht enthalten:** Bebauungsplan (für Oldenburg nur Umrisse als Datei, keine GRZ/GFZ-Zahlen als Dienst; entschieden: kein B-Plan), Lage-Faktor des
  Grundsteuer-Viewers (braucht den Durchschnittsrichtwert der Gemeinde), Eigentümer (nicht im Open-Data-Dienst).
  **Getestet** (echte Daten, Oldenburg Innenstadt 79 ha): 1.173 Flurstücke, 65 Zonen (Richtwerte 3,5 bis 2.350 €/m²), Laden, Einfärben nach Richtwert/GRZ,
  Mausklick, Infofeld, Fehlerfälle (BORIS nicht erreichbar: Flurstücke bleiben, Hinweis; ALKIS nicht erreichbar: Hinweis, alte Daten bleiben), Zurücksetzen,
  spätes Nachrechnen, wenn LoD2 nach OSM ankommt, alle Reiter danach ohne Fehler. Rechenzeit: Zonenzuordnung ca. 3 s (einmal beim Laden), Bestand ca. 0,7 s.
  **Befund:** ca. 50 Flurstücke haben GRZ knapp über 1 (Gebäudegeometrie aus OSM und Flurstück passen nicht ganz zusammen); das Infofeld erklärt es.
  Mit geladenem LoD2 ist die Haupt-GRZ niedriger (netto 0,46 statt 0,53), weil amtliche Nebengebäude (51009) abgezogen werden.
  GFZ-Einfärbung nur im Code und per Abfrage der Werte geprüft (Skala 0 bis 4; im Testgebiet liegen ca. 36 % der Flurstücke über 3, Maximum 8,6 wegen
  LoD2-Traufhöhe durch 3 m, nicht angesehen).
  **Nicht getestet:** GFZ-Einfärbung am Bildschirm, Gebiete außerhalb von Oldenburg und Gemeinden mit anderen Zonenarten (Nutzungsschlüssel wie WA, MI, GE sind
  nicht gegen die offizielle Liste geprüft), Gebiet mit 5.000 und mehr Flurstücken (Obergrenze, nur Hinweis im Code), Handy (Legende, Infofeld und Umschalter
  überlagern sich), andere Browser, Richtigkeit der Bodenrichtwerte (kommen 1:1 vom LGLN, Zonenwahl bei Überlagerung ist unsere Regel).
- [x] **Reiter „Mietpreise“ (Zensus-Raster) und Mietschätzung je Flurstück** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**): Neue Datei `mieten.js`.
  **Datenlage (geprüft):** Offene Mietdaten gibt es nur aus dem **Zensus 2022**: durchschnittliche Nettokaltmiete je m² im **100-m-Raster** (Lizenz
  Datenlizenz Deutschland Namensnennung 2.0). Wir fragen sie über einen offenen Kartendienst von **Esri Deutschland** ab
  (`services2.arcgis.com/.../Zensus2022_grid_final/FeatureServer/0`, Feld `durchschnMieteQM`, Browser-Zugriff erlaubt). Das ist eine Kopie der amtlichen Daten,
  **kein amtlicher Dienst**; verschwindet der Dienst, bleibt der Reiter leer (Hinweis). Die amtliche Alternative (CSV-Download von zensus2022.de, ca. 16 MB ZIP)
  ist für eine reine Browser-Seite unpraktisch. **Nicht gefunden:** Angebotsmieten, Mieten je Flurstück oder Gebäude, ein maschinenlesbarer Oldenburger Mietspiegel
  (nur PDF und Tabellen, Wohnlagen nach Straßen in 7 Zonen).
  **Aussage der Zahlen:** Bestandsmieten (alle bestehenden Mietverhältnisse, Stichtag 15.05.2022), keine Neuvertragsmieten; Zellen mit sehr wenigen Wohnungen
  haben keinen Wert (Grund Datenschutz: Vermutung, nicht belegt).
  **Reiter:** Rasterzellen nach €/m² eingefärbt (Skala 5. bis 95. Perzentil), Klick zeigt Miete, Abstand zum Gebietsdurchschnitt, Ø Wohnungsgröße,
  Monatsmiete der Ø-Wohnung, Einwohner, Eigentümer- und Leerstandsquote, Ø Alter. Legende mit Eckdaten, Quellenvermerk „© Statistische Ämter des Bundes und
  der Länder, Zensus 2022 (dl-de/by-2-0), Daten geändert“. Ladestand um „Mieten (Zensus 2022)“ ergänzt.
  **Flurstücke-Infofeld:** zusätzlich „Miete (grobe Schätzung)“: Miete des Rasters flächengewichtet auf das Flurstück übertragen; Wohnfläche = 75 % der
  Geschossfläche (Annahme); Spanne: untere Zahl nur Gebäude, die laut LoD2-Code oder OSM Wohnen sind, obere Zahl plus Gebäude ohne Nutzungsangabe (Gewerbe zählt
  nicht); Jahresmiete = Wohnfläche mal Miete mal 12. Das ist eine Überschlagsrechnung, kein Ertragswert.
  **Getestet** (echte Daten, Oldenburg Innenstadt 79 ha, mit LoD2): 79 Zellen, 67 mit Miete (5,29 bis 18,37 €/m², Ø 8,35 nach Einwohnern), Laden, Einfärben,
  Mausklick auf Zelle, Infofeld, Legende, Fehlerfall (Dienst 503: Reiter leer mit Hinweis, Flurstücke unberührt), Zurücksetzen, Mietschätzung im
  Flurstücke-Infofeld (944 Flurstücke mit Miete, 65 ohne), alle neun Reiter ohne Fehlermeldung.
  **Nicht getestet:** Gebiete außerhalb Oldenburgs, Handy, andere Browser, Richtigkeit der Schätzwerte (kein Vergleich mit Mietspiegel oder Marktdaten),
  ob der Esri-Dienst dauerhaft erreichbar bleibt, Gebiete ganz ohne Mietwerte (nur Code).
- [x] **Reiter „Luftbild“ und „Infos“** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**): Neue Dateien `luftbild.js` und `infos.js`.
  **Luftbild:** Das LGLN stellt die Digitalen Orthophotos (DOP20, 20 cm, **Flugzeugaufnahmen, keine Satellitenbilder**, CC BY 4.0) als WMS bereit
  (`https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms`, Ebene `ni_dop20`, Browser-Zugriff erlaubt, auch in EPSG:3857). Die Karte lädt nur die
  sichtbaren Kacheln. Der Reiter zeigt das Luftbild sofort (ohne „Analysieren“), mit Regler für Deckkraft, Schwarz-Weiß und ein- und ausschaltbaren Linien
  darüber: Gebäudeumrisse (OSM, gelb), Flurstücksgrenzen (blau gestrichelt), amtliche Straßenflächen (rosa); die Schalter sind grau, bis die Daten da sind.
  Quellenvermerk „Luftbild: LGLN (Jahr), CC BY 4.0“ (Jahr = Jahr des Datenbezugs, wie vom LGLN verlangt) in Kartenunterkante, Legende und Kartenattribution.
  Nur Niedersachsen: außerhalb Hinweis. Ein weltweites Satellitenbild (z. B. Esri World Imagery) ist **nicht** eingebaut (Lizenz und Dauer ungeklärt; entschieden:
  nur LGLN).
  **Infos:** 26 einzeln schaltbare Gruppen in 6 Bereichen aus OpenStreetMap: Kinder und Bildung (Kitas, Schulen, Hochschulen, Spielplätze), Einkaufen
  (Lebensmittel, Einkaufszentren, weitere Geschäfte), Verkehr (Bushaltestellen, Straßenbahnhaltestellen, Bahnhöfe und Haltepunkte, Bahnstrecken,
  Straßenbahn- und Stadtbahngleise, Fahrradverleih, Fahrradabstellanlagen, Parken, Ladesäulen, Carsharing), Gesundheit (Ärzte, Apotheken, Krankenhäuser),
  Essen, Kultur, Freizeit (Gastronomie, Kultur, Sport, Kirchen), Öffentliche Einrichtungen (Ämter/Polizei/Feuerwehr/Post, Toiletten). Am Anfang an:
  Kitas, Schulen, Spielplätze, Lebensmittel, Einkaufszentren, Bushaltestellen, Straßenbahnhaltestellen, Bahnhöfe, Bahnstrecken, Straßenbahngleise.
  Infofeld mit Kästchen je Gruppe (Anzahl dahinter), „Standard“, „Alle an“, „Alle aus“; die Auswahl wird im Browser gemerkt. **Oberkategorien schaltbar:** Jede der sechs
  Überschriften (Kinder und Bildung, Einkaufen, Verkehr, Gesundheit, Essen/Kultur/Freizeit, Öffentliche Einrichtungen) hat einen eigenen Schalter, der alle Gruppen des Bereichs
  auf einmal ein- oder ausschaltet; „halb“ (Strich) heißt: nur einige Gruppen an; ein Klick auf „halb“ schaltet den ganzen Bereich ein; die Summe der Orte steht hinter der Überschrift.
  Getestet (echte Daten): Bereich ein, aus, über einzelne Gruppe halb, Alle an, Alle aus, Standard, Karte zeigt jeweils nur die gewählten Bereiche (z. B. nur Gesundheit 18 Orte,
  plus Einkaufen 341), Summe der Bereiche = 809 Orte. Orte als farbige Kreise mit
  Kürzel (ohne Beschriftung auf der Karte), Bahnstrecken als Band mit hellen Strichen; Klick auf einen Ort öffnet ein Fenster mit Name, Art, Adresse,
  Betreiber, Öffnungszeiten (soweit in OSM eingetragen). **Ablauf:** zweite Overpass-Abfrage, die erst startet, wenn die Hauptabfrage von OSM durch ist (damit
  sie sich nicht ausbremsen); im Ladestand als „Infos“ sichtbar. Nur das gewählte Rechteck; Orte knapp außerhalb (z. B. Bahnhof am Rand) fehlen.
  **Getestet** (echte Daten): Luftbild Oldenburg Innenstadt (sofort sichtbar, Deckkraft, Schwarz-Weiß, drei Überlagerungen, Hinweis ohne Analyse, Quellenvermerk);
  Infos: 809 Orte im Testgebiet (z. B. 359 weitere Geschäfte, 142 Gastronomie, 24 Lebensmittel, 16 Bushaltestellen, 3 Schulen, 1 Kita, 4 Spielplätze), Ein-
  und Ausschalten einzeln und alle, Popup, Bahnhof und 14 Bahnabschnitte am Hauptbahnhof Oldenburg, Fehlerfall (502), alle elf Reiter ohne Fehlermeldung.
  **Befund:** Nur 1 Kita im Testgebiet ist ein Hinweis auf Lücken in OSM oder wenige Kitas in der Innenstadt, nicht geprüft. Keine Straßenbahn in Oldenburg.
  **Nicht getestet:** Luftbild außerhalb Niedersachsens (nur Code), Handy, andere Browser, sehr dichte Gebiete mit tausenden Orten (Tempo), Straßenbahn- und
  U-Bahn-Gleise (kein Testgebiet), ob die Kürzel verständlich sind (Geschmackssache), Lücken und Fehler in den OSM-Daten.
- [x] **Reiter „Wirtschaftlichkeit“** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**): Neue Datei `wirtschaft.js`. Flurstückskarte, bei der man ein
  Flurstück anklickt und einen **Steckbrief** (Luftbild-Ausschnitt des LGLN mit rotem Umriss, Fläche, Bodenrichtwert und Zone, Nutzung, Richtwert-GFZ, Bodenwert,
  Gebäude, GRZ/GFZ Bestand, Ø Geschosse, Rastermiete) und darunter eine **Wirtschaftlichkeitsrechnung** bekommt. Einfärbung wählbar: Neubau-Ergebnis je m²
  Grundstück (rot negativ, grün positiv), Rendite Bestand, Ausnutzung (GFZ Bestand zu Richtwert-GFZ). Die Rechnung läuft live: Eingaben ändern sofort alles.
  **A · Bestand (Ertragswert nach dem Prinzip der Immobilienwertermittlung):** vermietbare Fläche mal Miete mal 12 = Rohertrag, minus Bewirtschaftung = Reinertrag,
  minus Bodenwertverzinsung (Bodenwert mal Liegenschaftszins) = Gebäudereinertrag, mal Vervielfältiger (Restnutzungsdauer, Zins) = Gebäudeertragswert, plus Bodenwert =
  Ertragswert; dazu Ertragswert je m² Grundstück und Nettoanfangsrendite beim Kauf zum Ertragswert plus Nebenkosten. Trägt das Gebäude die Bodenverzinsung nicht,
  zählt nur der Bodenwert (Hinweis). **B · Neubau-Potenzial:** Geschossfläche = Richtwert-GFZ mal Fläche (**kein Bebauungsplan**), vermietbare Fläche, Neubaumiete =
  Bestandsmiete plus Aufschlag; Kosten = Grundstück mit Nebenkosten + Abbruch (m² Bestand) + Bau mit Baunebenkosten; Ertragswert nach Fertigstellung;
  Projektergebnis in € und in % der Kosten; Rendite auf die Kosten; **Residualwert** (was das Grundstück höchstens kosten dürfte) gegen den Bodenwert.
  **Eingaben:** je Flurstück Miete, vermietbare Fläche Bestand und GFZ für den Neubau überschreibbar (leer = Wert aus den Daten, grauer Platzhalter);
  allgemeine Annahmen (Wohnfläche 75 % der Geschossfläche, Bewirtschaftung 25 %, Liegenschaftszins 3,0 %, Restnutzungsdauer 40 J., Erwerbsnebenkosten 10 %, Baukosten
  3.200 €/m², Baunebenkosten 20 %, Abbruch 150 €/m², Aufschlag Neubaumiete 40 %, Nutzungsdauer Neubau 70 J.) in einem Ausklappfeld, im Browser gemerkt, Knopf
  „Standardwerte“. **(Überholt: diese ersten Standardwerte waren ungeprüfte Annahmen und sind durch belegte Werte ersetzt, siehe den nächsten Eintrag „Wirtschaftlichkeit: Standardwerte mit Quellen“.)** die Wohnfläche im Bestand zählt nur Gebäude, die laut LoD2-Code/OSM
  Wohnen sind (sonst die ohne Nutzungsangabe), Gewerbe wird nicht gerechnet.
  Technik: Der Bestand (`berechneBestand`) wird jetzt über `sorgeFuerBestand()` auch ohne den Reiter „Flurstücke“ gerechnet.
  **Getestet** (echte Daten, Oldenburg Innenstadt 79 ha, mit LoD2): 944 Flurstücke rechenbar, Rechenzeit ca. 0,6 s; ein Flurstück (527 m², Bodenrichtwert 500 €/m²,
  864 m² Wohnfläche, 8,44 €/m²) **von Hand nachgerechnet**: Rohertrag 87.450 €, Reinertrag 65.587 €, Vervielfältiger 23,11, Ertragswert 1.596.810 € (3.030 €/m²),
  Rendite 3,7 %; Neubau 1.265 m², Gesamtkosten 5.319.452 €, Ertragswert 2.969.812 €, Ergebnis −2.349.639 €, Residualwert −1.872.536 € (alle Zahlen stimmen mit der
  Formel überein). Live-Neuberechnung bei Eingaben (Fokus bleibt im Feld), Zurücksetzen, Standardwerte, drei Einfärbungen, Verkehrsfläche, Randflurstück,
  fehlende Miete, Luftbild-Ausschnitt mit Umriss, alle zwölf Reiter ohne Fehlermeldung, Flurstücke-Reiter nach der Umstellung unverändert (GRZ netto 0,46).
  **Befund mit den ersten, ungeprüften Standardwerten (überholt, Zahlen siehe nächster Eintrag):** Das Neubau-Ergebnis war fast überall negativ (nur 11 von 658 Flurstücken positiv, Ø Rendite Bestand 0,8 %). Grund:
  Die Rastermiete ist eine Bestandsmiete von 2022 (Ø 8,35 €/m²), plus 40 % ergibt 11,8 €/m², das trägt bei 3.200 €/m² Baukosten keinen Neubau. Das ist eine Folge
  der Annahmen und der Mietdaten, keine Aussage über Oldenburg; reale Neubaumieten und Baukosten bitte selbst eintragen.
  **Nicht getestet:** Gebiete außerhalb von Oldenburg, Handy (Panel ist hoch und überlagert die Karte), andere Browser, Gebiete mit Randflurstücken in großer Zahl, ob die
  Standardannahmen für deine Aufgabe passen, Vergleich mit einem echten Gutachten oder Marktdaten.
- [x] **Wirtschaftlichkeit: Standardwerte mit Quellen** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**): Auf Wunsch (Rückmeldung: „Werte mit Quellen nehmen, damit es
  akkurat wird“) sind die Standardwerte durch recherchierte Werte ersetzt; jedes Eingabefeld im Reiter zeigt Quelle, Link und eine Kennzeichnung **amtlich** (Gesetz,
  Verordnung, Gutachterausschuss, Statistik), **Marktangabe** (Ratgeber ohne amtliche Zahl) oder **Annahme** (meine). Bewirtschaftung ist jetzt nach ImmoWertV
  gerechnet (Verwaltung je Wohnung, Instandhaltung je m², Mietausfallwagnis), nicht mehr pauschal 25 %. Baukosten aus den Normalherstellungskosten mal Baupreisindex.
  | Wert | Standard | Art | Quelle |
  |---|---|---|---|
  | Liegenschaftszins | 2,2 % | amtlich | Gutachterausschüsse Niedersachsen, Landesgrundstücksmarktdaten 2025 (27.01.2025), Folie 20: Oldenburg, Mehrfamilienhäuser, bei 35 J. Restnutzungsdauer (`gag.niedersachsen.de/download/214752`). Gilt auch für den Neubau (Zins hängt etwas von der Restnutzungsdauer ab, nicht berücksichtigt). |
  | Gesamtnutzungsdauer | 80 J. | amtlich | ImmoWertV Anlage 1: Mehrfamilienhäuser (gelesen auf gesetze.legal, nicht auf gesetze-im-internet.de) |
  | Wohnfläche zu BGF | BGF = 1,55 × Wohnfläche | amtlich | Bewertungsgesetz Anlage 24 (Wohnungseigentum in Mehrfamilienhäusern). **Ersetzt mein früheres „75 % der Geschossfläche“, das nicht belegt war.** Geschossfläche wird als BGF genommen (Keller und Dach fehlen, Wohnfläche eher zu klein). |
  | Verwaltungskosten | 367 €/Wohnung/Jahr | amtlich | ImmoWertV Anlage 3: 298 € (01.01.2021) mal VPI-Faktor 123,0 (Okt. 2025) / 99,9 (Okt. 2020) = 1,231; Fortschreibung von mir gerechnet, deckt sich mit einer Ratgeberseite (367 €) |
  | Instandhaltung | 14,40 €/m²/Jahr | amtlich | ImmoWertV Anlage 3: 11,70 € mal 1,231 (dito) |
  | Mietausfallwagnis | 2 % | amtlich | ImmoWertV Anlage 3 |
  | Grunderwerbsteuer | 5,0 % | amtlich | Niedersachsen seit 01.01.2014; belegt über Ratgeberseiten (Gesetz selbst nicht gelesen) |
  | Notar und Grundbuch | 1,5 % | Marktangabe | Ratgeberseiten: 1,2 bis 2 % (GNotKG), keine amtliche Zahl |
  | Makler | 0 % | Annahme | kein Makler (Käuferanteil läge bei ca. 3,57 %) |
  | Baukosten Neubau | Normalherstellungskosten 2010 Typ 4.1/4.2/4.3 (nach Zahl der Wohnungen), Standardstufe 4, mal 2,0014 | amtlich + Annahme (Stufe) | ImmoWertV Anlage 4: Typ 4.2 Stufe 4 = 915 €/m² BGF, enthält Baunebenkosten (19 %) und Umsatzsteuer; Baupreisindex Wohngebäude Destatis August 2026 141,7 (2021 = 100) geteilt durch 70,8 (Jahresschnitt 2010, 2021 = 100) = 2,0014. Ergebnis Typ 4.2: **1.831 €/m² BGF**. Der Wert 70,8 stammt aus einer Ratgeberseite (KIM) die Destatis GENESIS 61261-0001 zitiert, nicht direkt geprüft. Die Standardstufe 4 ist meine Annahme. |
  | Abbruchkosten | 45 €/m³ umbauter Raum | Marktangabe | Abbruchfirmen und Ratgeber: 30 bis 60 €/m³ für massive Wohngebäude ohne Schadstoffe (Mitte); keine amtliche Quelle. Umbauter Raum = Grundfläche × LoD2-Höhe (sonst Geschosse × 3 m). |
  | Neubaumiete | Mietspiegel-Basismiete (Wohnungsgröße) × 1,10 | amtlich | Mietspiegel Oldenburg 2025: Tabelle 1 (20 bis 200 m², maschinell aus der Broschüre ausgelesen, 181 Werte geprüft, z. B. 65 m² = 8,33 €/m²), Tabelle 2 Baujahr 2016 bis 2022 = +10 %. Wohnlage (A +7 bis G −10 %) kennt das Tool nicht: Standard 0 % (Annahme). **Der Mietspiegel gilt nur bis Baujahr 2022 und ist die ortsübliche Vergleichsmiete; erzielbare Neubaumieten ab 2023 können höher liegen.** |
  | Restnutzungsdauer Bestand | 80 − (2026 − Baujahr), mindestens 20 J. | amtlich + Annahme | Baujahr = Median der Gebäude im 100-m-Raster (Zensus 2022, Gebäude nach Baujahrklassen, Klassenmitte); Mindestwert 20 J. ist meine Annahme (Modernisierung nach ImmoWertV Anlage 2 ist nicht bekannt). Ohne Baujahr: 80 / 2. |
  | Miete Bestand | Raster-Zensus 2022 (flächengewichtet) | Statistik | Bestandsmiete Mai 2022; zum Vergleich Mietspiegel Oldenburg Ø 8,57 €/m² (1.1.2025, Dokumentation Tabelle 2) gegenüber 8,35 €/m² im Raster des Testgebiets. |
  **Neu:** je Flurstück zusätzlich Baujahr und Neubaumiete überschreibbar; Ø Wohnungsgröße je Flurstück aus dem Raster (für die Zahl der Wohnungen, Verwaltungskosten und die
  Typwahl der Normalherstellungskosten); Gebäudevolumen je Flurstück (`bri`); die Daten des alten Speichers (Schlüssel `ortsanalyse-wirtschaft`) werden gelöscht, der neue heißt `-v2`.
  **Getestet** (echte Daten, Oldenburg Innenstadt, mit LoD2): ein Flurstück (5292/251, 527 m², Bodenrichtwert 500 €/m²) **unabhängig von Hand nachgerechnet**, alle Zeilen stimmen:
  Wohnfläche 743 m², Rohertrag 75.225 €, Bewirtschaftung 15.875 €, Reinertrag 59.350 €, Restnutzungsdauer 20 J. (Baujahr 1964, Mindestwert), Vervielfältiger 16,04, Ertragswert
  1.122.505 € (Rendite 5,0 %); Neubau 1.265 m² BGF, Gesamtkosten 2.753.686 €, Ertragswert 2.706.839 €, Ergebnis −46.847 € (−1,7 %), Residualwert 219.512 € (unter Bodenwert 263.500 €).
  Live-Neuberechnung bei Zins, Baujahr, eigenen Baukosten und Neubaumiete, Zurücksetzen, Standardwerte, alle zwölf Reiter ohne Fehlermeldung, Quellenanzeige im Panel (am Bildschirm gesehen).
  **Ergebnis im Testgebiet mit den belegten Werten:** Neubau-Ergebnis positiv bei 54 von 658 Flurstücken (vorher 11), Ø Rendite Bestand 2,9 %.
  **Grenzen (ehrlich):** (1) Die Normalherstellungskosten mit Baupreisindex liegen oft unter tatsächlichen Marktpreisen; wer BKI-Werte oder ein Angebot hat, trägt sie in „Eigene Baukosten“ ein.
  (2) Mietspiegel und Zensus sind keine Neubaumieten ab 2023. (3) Der Regionalfaktor der Gutachterausschüsse für die Normalherstellungskosten ist nicht berücksichtigt (nicht gefunden).
  (4) Liegenschaftszins gilt laut Quelle bei 35 Jahren Restnutzungsdauer. (5) Abbruch, Notar und Grundbuch sind Marktangaben ohne amtliche Zahl. (6) Wohnfläche aus Geschossfläche durch 1,55 ist eine
  Näherung. (7) Die Verbraucherpreisindex-Werte (99,9 und 123,0) und der Baupreisindex-Jahresschnitt 2010 stammen von Seiten, die Destatis zitieren, nicht direkt von Destatis.
  **Nicht getestet:** Gebiete außerhalb von Oldenburg (dort passen Zins und Mietspiegel nicht), Handy, andere Browser, Vergleich mit einem echten Gutachten oder Marktdaten.
- [x] **Reiter „Schnitt“: Linie ziehen, Schnitt und Straßenansicht, DXF-Export** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**): Neue Datei `schnitt.js`.
  Man zieht auf der Karte (Lageplan-Grundlage) mit gedrückter Maustaste eine gerade Linie (mindestens 5 m, im gewählten Rechteck; roter Strich mit Pfeil für die Blickrichtung, A weiß, B
  schwarz). Darunter entsteht eine Zeichnung in Metern 1:1 (SVG, Mausrad = Zoom, Ziehen = Verschieben, „Einpassen“). Umschalter: **Schnitt** und **Straßenansicht**; Blick nach links oder
  rechts; Tiefe der Ansicht (Standard 30 m); Schalter für Ansicht dahinter, Straßenflächen, Flurstücksgrenzen, Bemaßung.
  **Schnitt:** Gelände aus dem Höhenmodell DGM1 (Abstand ca. 0,25 m entlang der Linie), geschnittene Gebäude **schwarz als Vollkörper (Poché)**, gerechnet aus den echten LoD2-Dachflächen: jede
  Dachfläche wird mit der senkrechten Ebene durch die Linie geschnitten, daraus die Dachlinie (Abtastung alle 0,1 m) und der Fuß (LoD2-Geländehöhe am Gebäude); Beschriftung Firsthöhe in m ü. NHN
  und Gebäudehöhe. Dahinter in Blickrichtung die Gebäude grau (Ansicht). Straßenflächen aus den amtlichen Flächen (Fahrbahn, Weg, Platz) als Maßkette mit Breiten (benachbarte Flächen gleicher Art
  werden zusammengefasst), Flurstücksgrenzen als gestrichelte Linien, Länge, Höhenkoten an A und B, Höhenraster, Maßstabsbalken.
  **Straßenansicht:** alle Dach- und Wandflächen in Blickrichtung (an der Ebene abgeschnitten, bis zur gewählten Tiefe), nach Entfernung sortiert gemalt (Maleralgorithmus), Tönung nach Entfernung.
  **Ohne LoD2:** OSM-Gebäude als Blöcke (Höhe = Geschosse mal 3 m, im Schnitt als „geschätzt“ beschriftet; im Test 19,5 m statt LoD2 15,3 m).
  **DXF-Export** (nur DXF, wie gewünscht; kein PNG oder SVG): AutoCAD **R12 (AC1009)**, ASCII, 1 Einheit = 1 m, X = Abstand entlang der Linie in Blickrichtung (links nach rechts), Y = Höhe über NHN.
  Layer: GELAENDE, GEBAEUDE_SCHNITT, ANSICHT_NAH/MITTE/FERN (Entfernungsdrittel der Tiefe, damit man Strichstärken je Ebene wählen kann), STRASSE_FAHRBAHN/WEG/PLATZ, GRENZEN, BEMASSUNG,
  BESCHRIFTUNG (Text mit Linie A und B in UTM 32 und Quellen). Nur Linien, Polylinien und Text, **keine Füllungen oder Schraffuren**; ohne Verdeckung der Ansichtslinien (alle Kanten).
  Umlaute werden in der DXF umschrieben (R12 kennt kein Unicode).
  **Getestet** (echte Daten, Oldenburg Innenstadt, mit LoD2): Linie 186 m über Straße und Wege: 2 Gebäude geschnitten (16,1 m und 15,3 m), 267 Flächen in Blickrichtung, 8 Flurstücksgrenzen, Fahrbahn
  38,02 m, Gelände 1,5 bis 4,5 m NHN; beide Modi, Blick links und rechts (Spiegelung), Rückfall auf OSM-Blöcke, alle dreizehn Reiter ohne Fehlermeldung; Zeichnung am Bildschirm gesehen. **DXF mit einem
  unabhängigen Leseprogramm (ezdxf 1.4.5) eingelesen und geprüft: drei Dateien, 0 Fehler, 0 Warnungen**, Ebenen und Wertebereiche stimmen.
  **Nicht getestet / Grenzen:** DXF in Allplan und ArchiCAD (das müsstest du prüfen), sehr lange Linien (über 1 km), Gebäude mit Innenhöfen oder Durchfahrten (LoD2 hat keine Innenräume, werden zu
  Vollkörpern), Dachüberstände (können im Schnitt als Vollkörper zu breit wirken), Bäume (fehlen), Maleralgorithmus bei stark verschachtelten Dächern, Genauigkeit der Maße gegen Aufmaß (Gelände DGM1
  1 m Raster, Gebäude LoD2; nicht vermessungsgenau), Handy, andere Browser. Die Linie lässt sich nicht nachträglich an den Enden ziehen (neue Linie ziehen).
- [x] **Schnitt: Tiefe sichtbar, Bäume, Wasser, Gelände dahinter** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**; Erweiterung von `schnitt.js` nach Rückmeldung): „Tiefe“ ist die
  Tiefe der Schnitt-/Ansichtslinie, also wie weit die Zeichnung hinter der Linie reicht (Standard 30 m, einstellbar 5 bis 300 m).
  **Tiefe sichtbar:** auf der Karte als gestricheltes, rötlich getöntes **Band** neben der Linie in Blickrichtung (folgt Tiefe und Blickseite sofort); in der Zeichnung eine **Tiefenskala** (Farbverlauf
  dunkel = nah, hell = fern, mit 0 m und Tiefe) unten links; die Tiefenstaffelung ist kräftiger (Grau von 172 nah bis 238 fern, nahe Kanten stärker); die Infozeile nennt die Tiefe.
  **Bäume:** Stämme aus OpenStreetMap mit der Kronengröße der Karte (Krone aus OSM, aus der Höhe oder geschätzt), Höhe aus OSM, sonst das Doppelte des Kronendurchmessers (geschätzt, im Test 16 von
  18 Bäumen); Bäume als **Architektur-Strichzeichnung** (nach Rückmeldung: Farbverläufe wirkten kindlich): rein weiße Krone mit unregelmäßigem Umriss, **ohne Flecken** (Punktierung und Blattzeichen auf Wunsch entfernt), Astgabeln, Stamm mit Fuß und Rindenstrichen; Nadelbaum gestuft mit gezackten Stufen; **einfarbig**: weiße Fläche, überall dieselbe dunkle Linie, keine Abstufung nach Entfernung (Form je Baum fest, Zufall aus der Position; in der DXF nur die Umrisse von Stamm und Krone) (Form je Baum fest, Zufall aus der Position); in der DXF dieselben Umrisse; Bäume, die die Linie trifft, werden an der Ebene gekappt (Kreissehne) und dunkelgrün über dem Schnitt gezeichnet, Bäume dahinter
  nach Entfernung heller und zusammen mit den Gebäuden von hinten nach vorn sortiert.
  **Wasser:** Gewässerflächen aus OpenStreetMap, die die Linie kreuzt (genau), und Wasserlinien mit geschätzter Breite (gestrichelt, „ca.“); Wasserfläche als blauer Balken an der Geländehöhe mit
  Breite in der Maßkette (im Test 13,9 m). **Die Gewässertiefe ist unbekannt**: das Blau läuft nach unten aus (darstellerisch 1,5 m).
  **Gelände dahinter:** Höhenprofile des Höhenmodells in sechs Abständen hinter der Linie plus die Hüllkurve (höchster Wert je Stelle) als getönte Fläche; nur im Raster des Höhenmodells.
  Neue Schalter: Gelände dahinter, Bäume, Wasser. **DXF** neu: Layer BAEUME (Stamm und Krone als Vielecke), WASSER, GELAENDE_DAHINTER.
  **Getestet** (echte Daten, Linie 186 m): 18 Bäume (3 geschnitten), 1 Gewässer (65,7 bis 79,7 m), 6 Geländeprofile, Tiefenband auf der Karte bei 30 m und 60 m (gemessene Bandtiefe 60 m), Seitenwechsel
  (Band spiegelt), Schalter aus und an, beide Modi, alle dreizehn Reiter ohne Fehlermeldung; Zeichnung am Bildschirm gesehen; **DXF mit ezdxf geprüft: drei Dateien, 0 Fehler, 0 Korrekturen**.
  **Nicht getestet / Grenzen:** Baumhöhen sind meist geschätzt (nicht gemessen), Kronenform schematisch; Wasserlinien-Breite geschätzt; Gewässerprofil unbekannt; Gelände dahinter nur im Höhenraster
  (außerhalb Niedersachsens gibt es keins); DXF weiter nicht in Allplan oder ArchiCAD getestet; Handy, andere Browser.
- [x] **Reiter neu sortiert und umbenannt** (nur lokal, **nicht committet**): Reihenfolge nach Arbeitsablauf, mit Trennstrich zwischen den Gruppen:
  (1) Karte, Luftbild, Umgebung | (2) Schwarzplan, Straßennetz, Grün & Wasser, Lageplan | (3) Flurstücke, Mietpreise, Wirtschaftlichkeit | (4) Schnitt & Ansicht, 3D-Modell | (5) Kennzahlen.
  Umbenannt: Infos → **Umgebung**, Grün → **Grün & Wasser**, Schnitt → **Schnitt & Ansicht**, 3D → **3D-Modell**. Die internen Namen (`infos`, `gruen`, `schnitt`, `3d`) und alle Dateien
  bleiben gleich, geändert sind nur `index.html` (Reihenfolge, Beschriftung), `style.css` (Trennstrich) und der Ladeleisten-Text. **Nicht geprüft:** Handy-Breite (Leiste scrollt seitlich).
- [x] **README neu geschrieben** (nur lokal, **nicht committet**): Kurzbeschreibung, Schnellstart (Start.bat, Pages-Link als **ungetestet** gekennzeichnet), alle Reiter mit 14 Screenshots
  (`docs/bilder/`, mit dem Tool in Oldenburg aufgenommen), Export (nur was heute geht), Datenquellen mit Lizenzen, Grenzen, Technik, KI-Hinweis, Geplant.
  **Platzhalter für die Nutzerin / den Nutzer:** Namen der Gruppe, Kurs/Dozent, Datum, genaue Angaben zur KI-Nutzung nach den Regeln der Hochschule. Beschreibung der Rolle der
  Studierenden im KI-Hinweis ist eine Annahme und muss geprüft werden. Screenshots sind 800 px breit (Vorschau-Browser), Tab-Leiste teils abgeschnitten.
- [x] **Live-Demo über GitHub Pages geprüft** (17.11.2026): `https://jade-hs-vibecoding-wpk.github.io/Mapping-Tool-Architektur/` (Quelle: Branch `main`, Ordner `/`). Analyse Oldenburg Innenstadt mit
  LoD2 (1.078 Gebäude), Flurstücke (1.025), Bodenrichtwert-Zonen (67), Mietzellen (64), Gelände, Umgebung (724 Orte) und 3D-Modell laufen, keine Fehler außer dem erwarteten Overpass-502 (andere Server übernehmen).
  Alle Datendienste erlauben den Zugriff (CORS). **Nicht geprüft:** Schnitt und DXF auf der Live-Seite, Handy, Firefox/Safari.
  Hinweis: `main` enthält jetzt die Version von feature-osm-2d-plaene (zusammengeführt am 17.11.2026); `entwicklung` ist die zweite Version des Partners und unverändert.
- [x] **Sonne & Schatten** (Branch `feature-osm-2d-plaene`, nur lokal, **nicht committet**; Wunsch der Nutzerin / des Nutzers: Schattenplan, Besonnungsdauer, 3D mit Schatten, Bäume immer mit): Neue Datei `sonne.js`, neuer Reiter
  „Sonne & Schatten“ (nach Lageplan), Schalter „Sonne“ mit Datum und Uhrzeit im 3D-Modell (`ansicht3d.js`, gleiche Einstellung `sonneZustand`).
  **Rechnung:** Höhenraster (nach Rückmeldung „pixelig“ feiner: Schatten 0,5 m, Besonnungsdauer 1 m, einstellbar 2 / 1 / 0,5 m; beim Ziehen des Reglers 2 m, sanfte Skalierung im Bild; Strahlschritt mindestens 1 m, ab 120 m doppelt; Rechenzeit 0,5 m Schatten ca. 1 s, Besonnungsdauer 21.6. mit 1 m ca. 12 s) (Dächer aus LoD2 als Ebenen je Fläche, Ersatzblöcke aus OSM, Baumkronen als Ellipsoid/Kegel mit Unterkante, Gelände DGM1), Sonnenstand nach NOAA-Formel (geprüft: 21.6. Mittag in Oldenburg
  60,3 Grad, 21.12. etwa 13 Grad), Zeit MEZ/MESZ nach EU-Sommerzeitregel, je Zelle ein Strahl zur Sonne (bis 500 m, ab 1 Grad Sonnenhöhe). Besonnungsdauer alle 15 Minuten.
  **Getestet** (Oldenburg Innenstadt, 62 ha, LoD2): Schattenplan live per Regler; Besonnungsdauer 21.6. 16,3 h möglich, Mittel 8,2 h, Rechenzeit 2,3 s; 21.12. 7,0 h möglich, Mittel 1,1 h (0,8 s); 21.3. 11,8 h möglich, Mittel 4,6 h;
  Klick auf die Karte liefert Wert an der Stelle; 3D-Schatten (21.3. 16:40, 21.12. 13:30, 21.6. 16:00) sichtbar auf Boden und Gebäuden; Kamera-Nahebene von 1 auf 5 m gesetzt (sonst Flackern der Schattenfläche).
  **Gelernt:** Das Höhenrelief hatte keine Normalen, die Schattenfläche (`ShadowMaterial`) zeigte erst nach `computeVertexNormals()` etwas.
  **Grenzen:** Schatten von außerhalb des Rechtecks fehlen (Rand zu sonnig); Bäume im Winter undurchsichtig; Baumhöhen geschätzt; keine Dachüberstände, Balkone, Zäune; 2-m-Raster; mögliche Sonnenscheindauer bei klarem
  Himmel, kein Nachweis nach DIN 5034; **nicht geprüft:** Handy, Firefox/Safari, Gebiete ohne LoD2 (Ersatzblöcke) und ohne Gelände, 3D-Schatten bei sehr tiefer Sonne (unter 5 Grad).
- [~] **Export in allen Reitern mit Inhalt** (nur lokal, **nicht committet**; Änderungen nach Rückmeldung eingebaut): Neue Datei `export.js`. Der Knopf „Exportieren …“ steht **unten rechts im Hauptbereich** (in jedem Reiter an derselben Stelle,
  ausgegraut in Karte, Luftbild und Umgebung; Hinweis als Tooltip). **Maßstab frei wählbar** (1 : beliebige Zahl); ist das Gebiet größer als das Blatt, zeigt das Blatt einen **Ausschnitt** (nichts ragt über das Planfeld, Ausschnitt per Maus im Vorschaubild ziehen, Knopf „Ganzes Gebiet aufs Blatt“).
  Maßstabsleiste: größte runde Länge, die in den Plankopf passt. Reiter: **Luftbild** (WMS-Foto 25 cm je Pixel, zugeschnitten, mit den angehakten Linien; PDF/PNG/SVG, nur Niedersachsen) und **Umgebung** (helle Grundlage mit den angehakten Orten als Symbole, Gleisen, Legende mit Anzahl; auch DXF, GeoJSON, CSV), Schwarzplan, Straßennetz, Grün & Wasser, Lageplan, Sonne & Schatten, Flurstücke, Mietpreise, Wirtschaftlichkeit (PDF, PNG 150/300 dpi, SVG, DXF Allplan 2024 und ArchiCAD 29, GeoJSON;
  Flurstücke/Mieten/Wirtschaft zusätzlich CSV), **Schnitt & Ansicht** (PDF, PNG, SVG mit Plankopf im gewählten Maßstab, DXF), **3D-Modell** (Bild mit Plankopf als PDF, PNG, SVG; 3D-DXF mit LoD2-Wänden und -Dächern als 3DFACE und Gelände-Netz 5 m, Allplan/ArchiCAD),
  **Kennzahlen** (PDF, CSV). Sonne: Schatten/Besonnung als Pixelbild, nicht im DXF (Hinweis im Fenster).
  **Geprüft** (Oldenburg Innenstadt): PDF mit pdf.js gerendert (auch der Ausschnitt-Modus, Klemmen ok), PNG von allen Arten angesehen, DXF 2D und 3D mit ezdxf (AC1009, 0 Fehler; 3D: 96.000 Flächen, 16 MB), Schnitt mit Maßstabs-abhängiger Beschriftung, Kennzahlen CSV (49 Zeilen) und PDF erzeugt.
  **Nicht geprüft:** Download im echten Browser, DXF in Allplan/ArchiCAD, PDF/SVG von Schnitt und 3D visuell (nur PNG gesehen), Kennzahlen-PDF visuell, sehr große 3D-DXF in CAD (16 MB).
  **Noch offen:** Schwarzplan nach Höhe, Erreichbarkeit zu Fuß, Denkmal, mehrere Schnittlinien, Projekt speichern/laden, Datei-Import.
- [~] **Restliche Funktionen** (nur lokal, **nicht committet**; Entscheidungen der Nutzerin / des Nutzers: Kreise statt Wegenetz, Projekt nur im Browser merken, Import GeoJSON + Text-DXF + CityGML):
  (1) **Schwarzplan nach Höhe** (`hoehe.js`): Schalter „Schwarz / Nach Höhe“, fünf Grautöne (bis 6, 12, 18, 25 m, darüber), Höhe aus LoD2, OSM-Höhe, Geschosse mal 3 m oder Annahme; Legende, Export (DXF-Layer je Klasse).
  (2) **Denkmal** (`infos.js`): neue Gruppe aus OSM-Merkmal `heritage` (im Test 5 Objekte, OSM unvollständig); Kirchen u. ä. mit Denkmalstatus zählen zusätzlich.
  (3) **Erreichbarkeit zu Fuß** (`erreichbar.js`, Reiter Umgebung): Mittelpunkt klicken, Kreise 5/10/15 min = 400/800/1200 m Luftlinie (80 m/min, Annahme, kein Wegenetz); im Export mit Beschriftung und Legende.
  (4) **Mehrere Schnittlinien** (`schnitt.js`): Auswahlfeld „Linie“, Löschen, andere Linien grau gestrichelt auf der Karte.
  (5) **Projekt im Browser merken** (`projekt.js`): automatisch (localStorage): Gebiet, Reiter, Sonne, Einfärbungen, Luftbild, Kreise, Schnittlinien, LoD2 an/aus; Kasten „Wiederherstellen“ in der Seitenleiste; Daten werden neu geladen.
  (6) **Datei-Import** (`import.js`): GeoJSON, Text-DXF (UTM erkannt oder Bezugspunkt abgefragt), CityGML (ersetzt LoD2 über das LoD2-Hintergrundprogramm); orange Überlagerung und im Plan-Export als Ebene IMPORT_<Name>.
  **Getestet** (Oldenburg Innenstadt): Höhe (814 Gebäude klassiert, PNG), Denkmal, Kreise (Karte, PNG, DXF ezdxf 0 Fehler), zwei Schnittlinien (wechseln, löschen), Projekt speichern und wiederherstellen nach Neuladen, GeoJSON- und DXF-Import (eigenes UTM-DXF: 827 Objekte), binäres DXF abgelehnt mit Anleitung, alle 14 Reiter ohne Fehler.
  **Nicht getestet:** CityGML-Import (nur Programmweg, keine Beispieldatei), Text-DXF mit lokalen Koordinaten (Abfrage des Bezugspunkts per Eingabefenster), Import sehr großer Dateien, Projekt-Wiederherstellung mit allen Reitern einzeln.
  **Grenzen:** Kreise sind Luftlinie; Denkmal nur aus OSM; DXF-Import ohne Blöcke, Texte, Schraffuren; GeoJSON/DXF-Import nicht zwischen Sitzungen gemerkt.
- [x] **Oberfläche im Apple-Stil** (`style.css`, kleine Änderung in `app.js`): runde Ecken, Systemschrift, Karten in der Seitenleiste, milchig-durchsichtige Fenster über der Karte, Ein-Aus-Schalter statt Häkchen, Umschalter als Segmente, weiche Bewegungen (Fenster tauchen auf, Schnitt-Blatt kommt von unten, Export-Fenster blendet ein und aus, Druck-Rückmeldung sofort beim Drücken). Akzentfarbe jetzt iOS-Blau (Karte, Auswahl, Kreise). **Dunkelmodus** automatisch nach Systemeinstellung (nur Bedienflächen; Karte, Pläne, Zeichenblätter und Exporte bleiben hell). Berücksichtigt „weniger Bewegung“, „weniger Transparenz“, „mehr Kontrast“. **Getestet:** Hell und Dunkel, Reiter Karte, Lageplan, Sonne, Schnitt, Kennzahlen, Export-Fenster auf, zu. **Nicht getestet:** Handy, Firefox, Safari, Reiter 3D und Mietpreise in Dunkel.
- [ ] **Noch offen:** Poster, README-Platzhalter ausfüllen, Test der DXF-Dateien in Allplan/ArchiCAD (macht die Nutzerin / der Nutzer), Abstimmung der zwei Versionen (`entwicklung`).
- [ ] Hinweis: Die Hintergrundkarte kommt von den OSM-Kartenservern (tile.openstreetmap.org). Für ein
  Studienprojekt ist das in Ordnung. Bei vielen Nutzern müsste man einen anderen Kartendienst nehmen.
