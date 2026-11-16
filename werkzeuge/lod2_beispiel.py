"""Bereitet die amtlichen LoD2-Gebäude (CityGML, LGLN) für das Oldenburger Beispiel auf.

Das Ergebnis ist die Datei data/beispiel-oldenburg-lod2.js, die das Tool direkt lädt.
Nur nötig, wenn sich die Beispieldaten ändern. Aufruf (Python 3, ohne Zusatzbibliotheken):

    python werkzeuge/lod2_beispiel.py data/beispiel-oldenburg-lod2.js LoD2_32_447_5887_1_ni.gml LoD2_32_447_5888_1_ni.gml

Was passiert:
- Gebäude im Testgebiet (Mittelpunkt im Rechteck) werden übernommen.
- Wand- und Dachflächen bleiben getrennt (W / R), Bodenflächen entfallen.
- Koordinaten: Dezimeter relativ zum Nullpunkt des Testgebiets (UTM 32),
  Höhen in Dezimeter über dem Boden des jeweiligen Gebäudes.
"""
import json, re, sys
import xml.etree.ElementTree as ET

GML = "{http://www.opengis.net/gml}"
BLDG = "{http://www.opengis.net/citygml/building/1.0}"
FLAECHEN = {BLDG + "RoofSurface": "R", BLDG + "WallSurface": "W", BLDG + "GroundSurface": "G"}

# Testgebiet (UTM 32) mit etwas Rand, damit Gebäude am Rand des Rechtecks nicht fehlen
NULLPUNKT = (446885.0, 5887643.0)
GEBIET = (446860.0, 5887620.0, 447925.0, 5888680.0)


def ring(el):
    pl = el.find(f".//{GML}posList")
    v = [float(x) for x in pl.text.split()] if pl is not None else \
        [float(x) for p in el.iter(GML + "pos") for x in p.text.split()]
    pts = [v[i:i + 3] for i in range(0, len(v), 3)]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()  # Schlusspunkt doppelt
    return pts


def lese(pfad, gebaeude, kacheln):
    m = re.search(r"LoD2_32_(\d+)_(\d+)", pfad)
    if m:  # Abdeckung der Kachel merken (1 x 1 km)
        e, n = int(m.group(1)) * 1000, int(m.group(2)) * 1000
        kacheln.append([e - NULLPUNKT[0], n - NULLPUNKT[1], e + 1000 - NULLPUNKT[0], n + 1000 - NULLPUNKT[1]])
    for ev, el in ET.iterparse(pfad, events=("end",)):
        if el.tag != BLDG + "Building":
            continue
        flaechen = []
        for fl in el.iter():
            typ = FLAECHEN.get(fl.tag)
            if not typ:
                continue
            for poly in fl.iter(GML + "Polygon"):
                ext = poly.find(GML + "exterior")
                if ext is not None:
                    flaechen.append((typ, [ring(ext)] + [ring(i) for i in poly.findall(GML + "interior")]))
        boden = [p for t, r in flaechen if t == "G" for p in r[0]]
        alle = [p for t, r in flaechen for p in r[0]]
        if not alle:
            el.clear(); continue
        ref = boden or alle
        cx = sum(p[0] for p in ref) / len(ref)
        cy = sum(p[1] for p in ref) / len(ref)
        if GEBIET[0] <= cx <= GEBIET[2] and GEBIET[1] <= cy <= GEBIET[3]:
            basis = min(p[2] for p in (boden or alle))
            fn = el.find(f".//{BLDG}function")
            dach = el.find(f".//{BLDG}roofType")
            hoehe = el.find(f".//{BLDG}measuredHeight")
            gid = el.get(GML + "id")
            def dm(p):
                return [round((p[0] - NULLPUNKT[0]) * 10), round((p[1] - NULLPUNKT[1]) * 10), round((p[2] - basis) * 10)]
            fl_out = []
            for typ, ringe in flaechen:
                if typ == "G":
                    continue
                fl_out.append([typ] + [[c for p in r for c in dm(p)] for r in ringe if len(r) >= 3])
            gebaeude[gid] = [
                gid[-8:],                                   # kurze ID
                fn.text if fn is not None else "",          # ALKIS-Gebäudefunktion
                dach.text if dach is not None else "",      # Dachform (Code)
                round(float(hoehe.text), 1) if hoehe is not None else None,  # gemessene Höhe
                round(basis, 2),                            # Bodenhöhe (NHN)
                fl_out
            ]
        el.clear()


if __name__ == "__main__":
    gebaeude, kacheln = {}, []
    for p in sys.argv[2:]:
        lese(p, gebaeude, kacheln)
        print(p, len(gebaeude))
    daten = {"nullpunkt": NULLPUNKT, "epsg": 25832, "einheit": 0.1, "kacheln": kacheln,
             "gebaeude": list(gebaeude.values())}
    kopf = ("/* Eingebaute Beispieldaten: amtliche 3D-Gebaeude (LoD2), Oldenburg Innenstadt\n"
            " * Quelle: Landesamt fuer Geoinformation und Landesvermessung Niedersachsen (LGLN),\n"
            " * 3D-Gebaeudemodell LoD2, Lizenz CC BY 4.0. Kacheln: " +
            ", ".join(re.search(r"LoD2_32_\d+_\d+", p).group(0) for p in sys.argv[2:]) + "\n"
            " * Erzeugt mit werkzeuge/lod2_beispiel.py. Wird von lod2.js geladen.\n */\n")
    with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
        f.write(kopf + "window.BEISPIEL_LOD2 = ")
        json.dump(daten, f, separators=(",", ":"))
        f.write(";\n")
