"""Ergänzt das Oldenburger Beispiel um Daten aus topoexport (LGLN-Daten, CC BY 4.0).

1. Gebäude (LoD2 als Dreiecksnetz) aus der 3D-DXF für Bereiche OHNE CityGML-Kachel
   (Westrand des Testgebiets) -> werden an data/beispiel-oldenburg-lod2.js angehängt.
2. Amtliche Straßenflächen (Layer TPX_ROADS_HATCH) aus der 2D-DXF
   -> data/beispiel-oldenburg-strassen.js

Vorher lod2_beispiel.py ausführen (erzeugt die LoD2-Datei aus CityGML).
Braucht die Python-Bibliothek ezdxf (liest binäre DXF):  pip install ezdxf

    python werkzeuge/topoexport_beispiel.py topoexport_2D_vectorial.dxf topoexport_3D_modeling.dxf
"""
import json, math, sys
import ezdxf
from ezdxf import path as ezpath

LOD2_DATEI = "data/beispiel-oldenburg-lod2.js"
STRASSEN_DATEI = "data/beispiel-oldenburg-strassen.js"

# Lage des topoexport-Nullpunkts in UTM 32 (per Gebäudeabgleich ermittelt, siehe PLAN.md 4b-4)
TOPO_NULLPUNKT = (446885.3, 5887643.7)


def lies_js(pfad):
    text = open(pfad, encoding="utf-8").read()
    kopf, rest = text.split("window.BEISPIEL_LOD2 = ", 1)
    return kopf, json.loads(rest.rstrip().rstrip(";"))


def im_ring(x, y, ring):
    drin = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            drin = not drin
    return drin


def normale(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    l = math.sqrt(sum(v * v for v in n)) or 1
    return [v / l for v in n]


def dachflaechen_zusammenfassen(dreiecke):
    """Fasst Dach-Dreiecke, die in derselben Ebene liegen, zu ganzen Dachflächen zusammen.
    So sieht man im Lageplan keine Dreieckskanten auf den Dächern.
    dreiecke: Liste von (a, b, c) mit Punkten (x, y, z). Rückgabe: Liste von Flächen (Liste von Ringen)."""
    gruppen = {}
    for a, b, c in dreiecke:
        n = normale(a, b, c)
        if n[2] < 0:
            n = [-v for v in n]
        d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2]
        schluessel = (round(n[0] * 40), round(n[1] * 40), round(n[2] * 40), round(d * 4))
        gruppen.setdefault(schluessel, []).append((a, b, c))
    flaechen = []
    for tris in gruppen.values():
        # Kanten zählen: Eine Kante, die nur zu einem Dreieck gehört, ist Rand der Fläche
        key = lambda p: (round(p[0] * 100), round(p[1] * 100))
        punkt = {}
        kanten = {}
        for tri in tris:
            for p, q in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
                kp, kq = key(p), key(q)
                if kp == kq:
                    continue
                punkt[kp], punkt[kq] = p, q
                k = (min(kp, kq), max(kp, kq))
                kanten[k] = kanten.get(k, 0) + 1
        rand = [k for k, n in kanten.items() if n == 1]
        nachbarn = {}
        for a, b in rand:
            nachbarn.setdefault(a, []).append(b)
            nachbarn.setdefault(b, []).append(a)
        benutzt, ringe = set(), []
        for start in list(nachbarn):
            for erstes in nachbarn[start]:
                if (start, erstes) in benutzt:
                    continue
                ring, vorher, jetzt = [start], start, erstes
                benutzt.update({(start, erstes), (erstes, start)})
                while jetzt != start and len(ring) < 10000:
                    ring.append(jetzt)
                    weiter = [x for x in nachbarn[jetzt] if x != vorher and (jetzt, x) not in benutzt]
                    if not weiter:
                        break
                    vorher, jetzt = jetzt, weiter[0]
                    benutzt.update({(vorher, jetzt), (jetzt, vorher)})
                if jetzt == start and len(ring) >= 3:
                    ringe.append(ring)
        if not ringe:  # Notfall: Dreiecke einzeln übernehmen
            flaechen += [[list(t)] for t in tris]
            continue
        # Außenringe und Löcher (in der Draufsicht)
        ringe2d = [[r for r in ring] for ring in ringe]
        tiefe = [sum(1 for j, s in enumerate(ringe2d) if j != i and im_ring(*r[0], s)) for i, r in enumerate(ringe2d)]
        for i, r in enumerate(ringe):
            if tiefe[i] % 2 == 0:
                loecher = [s for j, s in enumerate(ringe) if tiefe[j] == tiefe[i] + 1 and im_ring(*s[0], ringe2d[i])]
                flaechen.append([[punkt[k] for k in ring] for ring in [r] + loecher])
    return flaechen


def main(dxf2d, dxf3d):
    kopf, daten = lies_js(LOD2_DATEI)
    e0, n0 = daten["nullpunkt"]
    dx, dy = TOPO_NULLPUNKT[0] - e0, TOPO_NULLPUNKT[1] - n0  # topoexport -> Beispiel-Koordinaten (m)
    daten["gebaeude"] = [g for g in daten["gebaeude"] if len(g) < 7]  # alte topoexport-Gebäude entfernen
    kacheln = [k for k in daten["kacheln"]]

    def in_kachel(x, y):
        return any(k[0] <= x < k[2] and k[1] <= y < k[3] for k in kacheln)

    # Dachumrisse der CityGML-Gebäude (2D) für den Doppelt-Test
    umrisse = []
    for g in daten["gebaeude"]:
        for fl in g[5]:
            if fl[0] == "R":
                r = fl[1]
                pts = [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 3)]
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                umrisse.append((min(xs), min(ys), max(xs), max(ys), pts))

    def von_citygml_bedeckt(x, y):
        return any(a <= x <= c and b <= y <= d and im_ring(x, y, pts) for a, b, c, d, pts in umrisse)

    doc3 = ezdxf.readfile(dxf3d)
    msp3 = doc3.modelspace()

    # Gelände (ca. 20-m-Raster) für die Bodenhöhe
    gelaende = []
    for e in msp3:
        if e.dxf.layer == "TPX_TERRAIN_TERRAIN_MESH" and e.dxftype() == "MESH":
            gelaende = [(v[0], v[1], v[2]) for v in e.vertices]
    def bodenhoehe(x, y):
        naechste = sorted(gelaende, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)[:4]
        gew = [1 / ((p[0] - x) ** 2 + (p[1] - y) ** 2 + 1) for p in naechste]
        return sum(w * p[2] for w, p in zip(gew, naechste)) / sum(gew)

    # Rahmen des topoexport-Ausschnitts
    rahmen = None
    for e in msp3:
        if e.dxf.layer == "TPX_FRAME_PROJECT":
            pts = [v.dxf.location for v in e.vertices] if e.dxftype() == "POLYLINE" else list(e.get_points())
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            rahmen = [min(xs) + dx, min(ys) + dy, max(xs) + dx, max(ys) + dy]
    print("Rahmen (Beispiel-Koordinaten, m):", [round(v, 1) for v in rahmen])

    neu, uebersprungen, nr = [], 0, 0
    for e in msp3:
        if e.dxf.layer != "TPX_BUILDINGS" or e.dxftype() != "MESH":
            continue
        v = [(p[0] + dx, p[1] + dy, p[2]) for p in e.vertices]
        if not v:
            continue
        cx = sum(p[0] for p in v) / len(v); cy = sum(p[1] for p in v) / len(v)
        # nur wo keine CityGML-Kachel liegt und kein CityGML-Gebäude steht
        if in_kachel(cx, cy) or von_citygml_bedeckt(cx, cy):
            uebersprungen += 1
            continue
        basis = min(bodenhoehe(cx - dx, cy - dy), min(p[2] for p in v))
        def dm(p):
            return (round(p[0] * 10), round(p[1] * 10), round((p[2] - basis) * 10))
        flaechen, dach = [], []
        for f in e.faces:
            for i in range(1, len(f) - 1):  # Vielecke in Dreiecke zerlegen
                a, b, c = v[f[0]], v[f[i]], v[f[i + 1]]
                n = normale(a, b, c)
                if n[2] < -0.3:
                    continue  # Unterseite: sieht man nicht
                if abs(n[2]) < 0.3:
                    flaechen.append(["W", [c2 for p in (a, b, c) for c2 in dm(p)]])
                else:
                    dach.append((a, b, c))
        for fl in dachflaechen_zusammenfassen(dach):
            flaechen.append(["R"] + [[c2 for p in ring for c2 in dm(p)] for ring in fl])
        if flaechen:
            nr += 1
            hoehe = round(max(p[2] for p in v) - basis, 1)
            neu.append([f"T{nr:05d}", "", "", hoehe, round(basis, 2), flaechen, "T"])
    daten["gebaeude"] += neu
    # Abdeckung durch topoexport-Gebäude (nur außerhalb der Kacheln), für die Ersatz-Klötze
    daten["topoexport"] = {"rahmen": rahmen, "gebaeudeteile": len(neu)}
    print("topoexport-Gebäudeteile übernommen:", len(neu), "übersprungen (CityGML vorhanden):", uebersprungen)

    kopf = kopf.replace(" * Erzeugt mit", " * Westrand ergaenzt aus topoexport 3D (LGLN LoD2 als Dreiecksnetz, CC BY 4.0).\n * Erzeugt mit") \
        if "Westrand" not in kopf else kopf
    with open(LOD2_DATEI, "w", encoding="utf-8", newline="\n") as f:
        f.write(kopf + "window.BEISPIEL_LOD2 = ")
        json.dump(daten, f, separators=(",", ":"))
        f.write(";\n")

    # ---- Straßenflächen aus der 2D-DXF ----
    doc2 = ezdxf.readfile(dxf2d)
    ringe = []
    for e in doc2.modelspace():
        if e.dxf.layer == "TPX_ROADS_HATCH" and e.dxftype() == "HATCH":
            for p in ezpath.from_hatch(e):
                pts = [(q[0] + dx, q[1] + dy) for q in p.flattening(0.2)]
                if len(pts) > 1 and pts[0] == pts[-1]:
                    pts.pop()
                if len(pts) >= 3:
                    ringe.append(pts)
    # Außenringe und Löcher bestimmen: Wie oft liegt ein Ring in anderen Ringen?
    tiefe = []
    for i, r in enumerate(ringe):
        x, y = r[0]
        tiefe.append(sum(1 for j, s in enumerate(ringe) if j != i and im_ring(x, y, s)))
    polygone = []
    for i, r in enumerate(ringe):
        if tiefe[i] % 2 == 0:
            loecher = [s for j, s in enumerate(ringe) if tiefe[j] == tiefe[i] + 1 and im_ring(s[0][0], s[0][1], r)]
            polygone.append([[c for p in ring for c in (round(p[0] * 10), round(p[1] * 10))] for ring in [r] + loecher])
    print("Straßenflächen:", len(polygone), "Polygone aus", len(ringe), "Ringen")
    strassen = {"nullpunkt": daten["nullpunkt"], "einheit": 0.1, "rahmen": rahmen, "flaechen": polygone}
    with open(STRASSEN_DATEI, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* Eingebaute Beispieldaten: amtliche Strassenflaechen, Oldenburg Innenstadt\n"
                " * Quelle: LGLN Niedersachsen, DLM 2024 (CC BY 4.0), ueber topoexport.com. Nicht vermessungsgenau.\n"
                " * Erzeugt mit werkzeuge/topoexport_beispiel.py. Wird von lod2.js geladen.\n */\n"
                "window.BEISPIEL_STRASSEN = ")
        json.dump(strassen, f, separators=(",", ":"))
        f.write(";\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
