"""Schneidet die Zensus-2022-Mietkarte (100-m-Gitter) für das Oldenburger Beispiel aus.

Quelle: Statistische Ämter des Bundes und der Länder, Zensus 2022, „Durchschnittliche Nettokaltmiete“,
Gitterzellen 100 m, Datenlizenz Deutschland Namensnennung 2.0. Download (ZIP):
https://www.destatis.de/static/DE/zensus/gitterdaten/Zensus2022_Durchschn_Nettokaltmiete.zip

    python werkzeuge/zensus_miete_beispiel.py Zensus2022_Durchschn_Nettokaltmiete.zip data/beispiel-oldenburg-miete.js
"""
import io, json, math, sys, zipfile

# Oldenburger Beispielgebiet [West, Süd, Ost, Nord] in Grad (wie in osm.js)
GEBIET = (8.205884, 53.135548, 8.221177, 53.144717)


def laea(lon, lat):
    """Grad → EPSG:3035 (ETRS89 / LAEA Europe), Formeln nach Snyder für das Ellipsoid GRS80."""
    a, f = 6378137.0, 1 / 298.257222101
    e2 = f * (2 - f); e = math.sqrt(e2)
    def q(phi):
        s = math.sin(phi)
        return (1 - e2) * (s / (1 - e2 * s * s) - 1 / (2 * e) * math.log((1 - e * s) / (1 + e * s)))
    phi0, lam0 = math.radians(52), math.radians(10)
    phi, lam = math.radians(lat), math.radians(lon)
    qp = q(math.pi / 2)
    beta, beta0 = math.asin(q(phi) / qp), math.asin(q(phi0) / qp)
    rq = a * math.sqrt(qp / 2)
    d = a * math.cos(phi0) / math.sqrt(1 - e2 * math.sin(phi0) ** 2) / (rq * math.cos(beta0))
    b = rq * math.sqrt(2 / (1 + math.sin(beta0) * math.sin(beta) + math.cos(beta0) * math.cos(beta) * math.cos(lam - lam0)))
    x = 4321000 + b * d * math.cos(beta) * math.sin(lam - lam0)
    y = 3210000 + b / d * (math.cos(beta0) * math.sin(beta) - math.sin(beta0) * math.cos(beta) * math.cos(lam - lam0))
    return x, y


w, s, o, n = GEBIET
ecken = [laea(lon, lat) for lon, lat in [(w, s), (o, s), (o, n), (w, n)]]
x0, x1 = min(p[0] for p in ecken) - 100, max(p[0] for p in ecken) + 100
y0, y1 = min(p[1] for p in ecken) - 100, max(p[1] for p in ecken) + 100

z = zipfile.ZipFile(sys.argv[1])
name = [i for i in z.namelist() if "100m" in i and i.endswith(".csv")][0]
zellen = []
with z.open(name) as f:
    next(f)
    for zeile in io.TextIOWrapper(f, encoding="latin1"):
        teile = zeile.rstrip("\r\n").split(";")
        x, y = int(teile[1]), int(teile[2])
        if x0 <= x <= x1 and y0 <= y <= y1 and teile[3]:
            # [Mitte Ost, Mitte Nord, €/m², 1 = unsicherer Wert (in Klammern)]
            zellen.append([x, y, float(teile[3].replace(",", ".")), 1 if teile[4] else 0])
print("Zellen im Gebiet:", len(zellen))
with open(sys.argv[2], "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Eingebaute Beispieldaten: durchschnittliche Nettokaltmiete je m², Zensus 2022 (Stichtag 15.05.2022),\n"
            " * 100-m-Gitterzellen, Oldenburg Innenstadt. Koordinaten = Zellmitte in EPSG:3035.\n"
            " * Quelle: Statistische Ämter des Bundes und der Länder, Zensus 2022 (dl-de/by-2-0).\n"
            " * Erzeugt mit werkzeuge/zensus_miete_beispiel.py. Wird von miete.js geladen.\n */\n"
            "window.BEISPIEL_MIETE = ")
    json.dump({"epsg": 3035, "zellgroesse": 100, "stichtag": "2022-05-15", "zellen": zellen}, f, separators=(",", ":"))
    f.write(";\n")
