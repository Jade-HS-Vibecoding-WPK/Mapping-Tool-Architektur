# PLAN.md

Stand: Mo 16.11.2026, Tag 1. Es ist noch nichts gebaut, das ist der Plan.

## Idee

Eine kleine Web-App, die zu einer Adresse automatisch Lageplan, Schwarzplan und 3D-Gebäudemodell der Umgebung erfasst, übersichtlich darstellt und zusammenfasst.

Für wen: Architekturstudierende, die am Anfang eines Entwurfs schnell die Umgebung eines Grundstücks brauchen.

## Die eine Frage: Was muss am Freitag laufen?

**Adresse eingeben, dann sehe ich Lageplan, Schwarzplan und 3D der Umgebung.**

Fertig ist das, wenn das für drei Testadressen ohne Fehler klappt (siehe "Fertig-Kriterium").

## Must (muss Freitag laufen)

- Adresse eingeben und den Ort auf der Karte finden
- Gebäude aus OpenStreetMap laden
- **Schwarzplan:** Gebäude schwarz auf weiß
- **Lageplan:** Gebäude, Straßen, Grünflächen und Wasser
- **3D:** Gebäude als Volumen, drehbar (Höhe aus den Daten, sonst eine Annahme)
- Umschalten zwischen den drei Ansichten
- Quellenangabe OpenStreetMap sichtbar (Lizenzpflicht)
- Verständliche Fehlermeldung, wenn eine Adresse nicht gefunden wird oder der Datendienst ausfällt
- **README** mit Erklärung, Start-Anleitung, Datenquellen und Grenzen
- **Poster** (Vorlage Moodle)
- **Projekt in der GitHub-Organisation**

## Should (wäre gut)

- Kennzahlen: Anzahl Gebäude, überbaute Fläche, Grünanteil, Wasseranteil, Straßenlänge
- Ebenen einzeln ein- und ausschalten
- PNG-Export mit Maßstab, Nordpfeil und Quellenangabe
- Auswahl der Ausschnittgröße (300, 600, 1000 m)
- Online-Version über GitHub Pages (Link fürs Poster, z. B. als QR-Code)

## Could (wenn Zeit bleibt)

- Höhenschichten (Topographie) aus einem Geländemodell
- Automatisch formulierte Textzusammenfassung
- SVG-Export des Schwarzplans für Illustrator oder Rhino
- Flurstück oder Grundstück auf der Karte anklicken

## Fertig-Kriterium (Definition of Done für Must)

Für jede der drei Testadressen gilt:

1. Adresse eingeben, nach wenigen Sekunden erscheint der Plan.
2. Schwarzplan, Lageplan und 3D lassen sich umschalten, ohne dass etwas fehlt oder kaputt aussieht.
3. Es gibt keine Fehlermeldung in der Konsole und keinen leeren Bildschirm.
4. Die Quellenangabe ist sichtbar.

Die drei Testadressen suchen wir am Mittwoch aus und prüfen, wie vollständig die Daten dort sind. Sie sollen verschiedene Fälle abdecken:

- dichte Innenstadt, gut für den Schwarzplan
- Bereich mit Park, gut für Grünflächen
- Bereich am Wasser, gut für Wasserflächen

## Etappen

Pro Sitzung ein Feature. Nach jedem Feature testen, committen, Stand hier eintragen.

| Tag | Etappe | Ergebnis |
|---|---|---|
| Mo | Idee und Plan | PLAN.md und CLAUDE.md stehen |
| Di | Grundgerüst und Aussehen | Seite läuft, dunkles Design, Karte mit **Beispieldaten**, Umschalter für die drei Ansichten. **Erster Push nach GitHub muss klappen** |
| Mi | Echte Daten | Adresssuche, dann Gebäude (Schwarzplan), dann Straßen/Grün/Wasser (Lageplan), dann Höhen (3D). Testadressen festlegen |
| Do | Fertig und Poster | Should-Punkte, Test der drei Adressen, README, Poster anfangen. **Code-Freeze 12 Uhr** (spätestens 18 Uhr laut Folie) |
| Fr | Polieren und präsentieren | Poster fertig, Upload in die Organisation **bis 16 Uhr**, Präsentation |

### Features in Reihenfolge

1. Seitenlayout und Design mit leerer Karte
2. Beispielgebäude auf der Karte, Schwarzplan-Ansicht
3. Lageplan-Ansicht und 3D-Ansicht mit Beispieldaten
4. Adresssuche
5. Echte Gebäude laden
6. Echte Straßen, Grün und Wasser laden
7. Echte Gebäudehöhen für 3D
8. Fehlermeldungen und Ladeanzeige
9. (Should) Kennzahlen, Ebenen-Schalter, PNG-Export
10. (Should) GitHub Pages
11. (Could) siehe oben

## Teamarbeit

- Pro Person und Feature ein eigener Branch, nie direkt auf `main` arbeiten.
- Vor jeder Sitzung zuerst den neuesten Stand holen (`git pull`), damit niemand auf altem Code aufbaut.
- Kleine Commits, nach jedem funktionierenden Feature.
- Alle arbeiten mit derselben `CLAUDE.md`, damit der Agent bei allen nach denselben Regeln arbeitet.

## Technik (Vorschlag)

- Reine Webseite aus HTML, CSS und JavaScript, nichts zu installieren
- Kartendarstellung im Browser
- Daten: Nominatim (Adresse), Overpass (OpenStreetMap), alles ohne API-Key
- Abgabe als Repository mit README. GitHub Pages nur als Zusatz.

## Risiken

- **GitHub-Zugang für den Agenten fehlt noch.** Ohne die Claude GitHub App in der Organisation kann der Agent nicht pushen. Der Upload klappt dann nur von Hand über die Weboberfläche oder per Fork. **Bis Dienstag klären**, nicht erst Freitag um 15:30 Uhr.
- **Datendienste können überlastet sein.** Darum bis Mittwoch früh echte Daten testen.
- **Gebäudehöhen fehlen oft in OpenStreetMap.** 3D nutzt dann eine Annahme und sagt das offen.
- **Zu viel auf einmal.** Wenn Mittwoch eng wird, bleibt 3D vor Wasser und Kennzahlen, und wir streichen aus Should.
- **Zwei Fristen in den Folien:** Do 18 Uhr Freeze und Fr 16 Uhr Abgabe. Bei der Kursleitung klären.

## Stand und nächste Schritte

- [x] Idee und Fragen geklärt
- [x] Must, Should, Could festgelegt
- [ ] GitHub-Zugang für die Organisation klären
- [ ] CLAUDE.md prüfen und anpassen
- [x] Feature 1: Seitenlayout und Design mit leerer Karte (getestet, Branch `claude/feature-1-layout`, noch nicht committet)
- [ ] Feature 2: Beispielgebäude auf der Karte, Schwarzplan-Ansicht

Hinweis: Es gibt einen frühen Prototyp auf dem lokalen Branch `claude/mapping-tool-web-app` (nicht hochgeladen). Entscheidung, ob er als Referenz bleibt oder verworfen wird: später.
