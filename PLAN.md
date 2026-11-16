# PLAN.md – Stadtanalyse-Tool

> Arbeitstitel: **„Ortsanalyse“**: ein Web-Tool, das für ein frei gewähltes Gebiet automatisch
> Schwarzplan, Straßennetz, Grün/Vegetation, Lageplan und 3D-Modell erzeugt, auswertet und
> kompakt zusammenfasst.

Stand: **OSM-Daten und 2D-Pläne funktionieren** (siehe Abschnitt 8).

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
4. **OSM-Daten und 2D-Pläne** ✅: Schwarzplan, Straßennetz, Grün und Lageplan erscheinen; Kennzahlen
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
- [x] **OSM-Daten und 2D-Pläne fertig** (16.11.2026, Schritt 4 in Abschnitt 6):
  - Neue Dateien: `osm.js` (Overpass-Abfrage, Umwandlung mit osmtogeojson, Zuschnitt aufs Rechteck,
    Kategorien), `plaene.js` (die vier Pläne auf weißem Blatt), `kennzahlen.js` (Rechnung und Tafel),
    `data/beispiel-oldenburg-osm.js` (eingebaute OSM-Daten des Testgebiets, Stand 24.07.2026, 2 MB).
  - „Analysieren“ fragt Overpass ab (drei Server nacheinander, bis 2,5 Minuten Wartezeit je Server).
    Ist kein Server erreichbar und liegt das Gebiet im Oldenburger Testgebiet, nimmt das Tool die
    eingebauten Daten. Der Knopf „Beispiel Oldenburg laden“ wählt das Testgebiet und nutzt sofort die
    eingebauten Daten.
  - Pläne: weißes Blatt ohne Hintergrundkarte, Norden immer oben (Drehen abgeschaltet), Nordpfeil,
    Maßstabsleiste, Legende mit Quellenangabe, roter Rahmen des Gebiets. Nebengebäude grau und per
    Häkchen ausblendbar. Straßen nach Kategorie über die Linienstärke. Lageplan zeigt den Straßenraum
    als hellgraues Band in typischer Breite.
  - Kennzahlen: Gebietsfläche, Bauland netto, Gebäude, bebaute Fläche, GRZ brutto/netto, Nebengebäude,
    mittlere Geschosszahl (Reihenfolge: OSM-Geschosse, sonst Höhe ÷ 3 m, sonst **2 Geschosse**,
    Anteil der geschätzten wird angezeigt), Geschossfläche, GFZ brutto/netto, Grünanteil, Einzelbäume,
    Straßenlängen nach Kategorie, Flächenanteile (als einfache Balken), Gebäude nach Nutzung.
  - Netto-Flächen: Straßen-, Bahn-, Grün- und Wasserflächen werden auf ein Raster (1 Pixel = 1 m²)
    gemalt und gezählt, so zählen Überlappungen nicht doppelt. Straßenflächen sind aus den Linien mit
    typischen Breiten geschätzt (Tabelle `STRASSEN_TYPEN` in `osm.js`).
  - Gebietsgrenze auf ca. 1,1 km² angehoben, weil der topoexport-Ausschnitt (1012 × 1009 m) knapp über 1 km² liegt.
  - Testergebnis Beispiel Oldenburg: 1.290 Gebäude, 31 Nebengebäude, GRZ 0,34 brutto / 0,55 netto,
    GFZ 1,01 / 1,66, Grünanteil 11,1 %, 986 Bäume, 47 km Wege und Straßen. 53 % der Gebäude haben in
    OSM keine Geschosszahl, 56 % keine Nutzung („unbekannt“): Das verbessern später die LoD2-Daten.
  - Im Browser getestet: Beispiel, Live-Abfrage (ca. 50 s), alle Reiter, Handybreite 375 px.
  - Kronenüberdeckung zeigt „folgt“ (braucht die Kronengrößen aus topoexport).
- [x] **Korrekturen nach Durchsicht** (16.11.2026):
  - **3D-Modell im Beispiel Oldenburg eingebaut** (`dreid.js`, three.js 0.147): 1.437 amtliche LoD2-Gebäude
    mit echten Dachformen (Wände weiß, Dächer hellgrau, feine Kanten), 986 Bäume aus OSM (Stamm + Krone,
    Höhe aus der Krone geschätzt), Boden, roter Gebietsrahmen und Nordpfeil. Drehen, Zoomen, Verschieben,
    „Ansicht zurücksetzen“. Außerhalb der LoD2-Kacheln stehen Ersatz-Klötze aus OSM (rötlich, Geschosse × 3 m).
    Andere Gebiete bekommen nur Ersatz-Klötze.
  - Daten: `data/beispiel-oldenburg-lod2.js` (2 MB, Kacheln 447_5887 und 447_5888, Koordinaten in dm),
    erzeugt mit `werkzeuge/lod2_beispiel.py` aus den CityGML-Dateien. Umrechnung UTM 32 ↔ Grad mit proj4 (`lod2.js`).
  - **Lageplan:** Gebäude hell mit dunklem Umriss, darauf die LoD2-Dachflächen **schattiert nach Neigung**
    (Licht von Nordwesten, 45°). Ohne LoD2-Daten: helle Gebäude ohne Dachformen.
  - **Straßen als Flächen mit Rand** statt als Strich: aus den OSM-Linien in typischer Breite (75 % des
    Straßenraums), Ränder verschmelzen an Kreuzungen. Im Straßennetz nach Kategorie abgestuft (dunkel =
    wichtig), schmale Wege gestrichelt. Im Lageplan einheitlich hell mit grauem Rand.
  - **Google Maps / Apple Karten bewusst nicht verwendet:** Deren Bedingungen verbieten das Abzeichnen
    und Herausziehen von Daten, außerdem bräuchten sie einen API-Key. Stattdessen später die amtlichen
    Straßenflächen aus topoexport (LGLN, `TPX_ROADS_CONTOURS`/`_HATCH`).
  - Legenden lassen sich per Klick auf den Titel einklappen.
- [x] **topoexport eingebaut** (16.11.2026):
  - Richtige Daten: `topoexport-D8F988.zip` (Rahmen 1012 × 1009 m, Gelände −0,9 bis 8,3 m, Nullpunkt
    UTM32 E 446 885,3 / N 5 887 643,7, Abgleich mit OSM-Gebäuden bestätigt). **Achtung:** Die losen DXF-Dateien
    im Downloads-Ordner (763 × 761 m, Gelände 31–34 m) stammen aus einem anderen Export und zeigen einen anderen Ort.
  - `werkzeuge/topoexport_beispiel.py` (braucht ezdxf): hängt **661 Gebäudeteile** (LoD2-Dreiecksnetz) für den
    Westrand ohne CityGML-Kachel an `data/beispiel-oldenburg-lod2.js` an (Wand/Dach über Neigung, Boden aus dem
    Geländemodell) und schreibt die **amtlichen Straßenflächen** (`TPX_ROADS_HATCH`, 5 Flächen aus 92 Ringen)
    nach `data/beispiel-oldenburg-strassen.js`. Im 3D-Modell bleiben nur 22 Ersatz-Klötze ganz am Rand.
  - Erkenntnis: Die amtlichen Straßenflächen (DLM) enthalten **nur das Hauptstraßennetz** (ca. 6,4 ha).
    Darum: amtliche Fläche, wo vorhanden; alle übrigen Straßen (Wohnstraßen, Fußgängerzone) weiter als Fläche
    aus OSM (Abschnitte, die in einer amtlichen Fläche liegen, entfallen). Gilt für Pläne und Netto-Rechnung.
  - Straßennetz-Plan: Straßenflächen hell mit Rand, darauf die **Achsen nach Kategorie** (Linienstärke).
  - Kennzahlen Beispiel: Verkehrsfläche jetzt 21 % (vorher 26 % rein aus OSM geschätzt).
- [ ] **Nächster Schritt:** Datei-Import und Detailstufen-Regel (Schritt 5): CityGML (ZIP, mehrere Kacheln,
  Anzeige der benötigten Kacheln) und topoexport-DXF im Browser (binär), Verortung von Hand.
  Idee: die topoexport-Bäume (2756–4401, mit Kronengröße) statt der OSM-Bäume für Grün und 3D nutzen.
- [ ] Offen aus Schritt 3: Datenquellen prüfen (topoexport: Koordinaten des Ausschnitts, UTM-32-Export, Kosten)
- [x] Legende ein- und ausklappbar
- [ ] Hinweis: Die Hintergrundkarte kommt von den OSM-Kartenservern (tile.openstreetmap.org). Für ein
  Studienprojekt ist das in Ordnung. Bei vielen Nutzern müsste man einen anderen Kartendienst nehmen.
