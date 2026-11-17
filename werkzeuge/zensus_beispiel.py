"""Schneidet die Zensus-2022-Karten (100-m-Gitter) für das Oldenburger Beispiel aus.

Quelle: Statistische Ämter des Bundes und der Länder, Zensus 2022, Gitterzellen 100 m,
Datenlizenz Deutschland Namensnennung 2.0. Downloads (ZIP) unter
https://www.destatis.de/static/DE/zensus/gitterdaten/<Name>.zip, benötigt werden:
  Zensus2022_Durchschn_Nettokaltmiete, Leerstandsquote_in_Gitterzellen,
  Durchschnittliche_Flaeche_je_Wohnung_in_Gitterzellen, Durchschnittliche_Wohnflaeche_je_Bewohner_in_Gitterzellen,
  Eigentuemerquote_in_Gitterzellen, Gebaeude_nach_Baujahr_Jahrzehnte

    python werkzeuge/zensus_beispiel.py <Ordner mit den ZIPs> data/beispiel-oldenburg-zensus.js
"""
import glob, io, json, math, os, re, sys, zipfile

# Oldenburger Beispielgebiet [West, Süd, Ost, Nord] in Grad (wie in osm.js)
GEBIET = (8.205884, 53.135548, 8.221177, 53.144717)

# Merkmal → Muster des Dateinamens der 100-m-Tabelle (wie in import.js)
MERKMALE = {
    "miete": r"nettokaltmiete",
    "leerstand": r"^zensus2022_leerstandsquote",
    "flaecheWohnung": r"flaeche_je_wohnung",
    "flaecheBewohner": r"flaeche_je_bewohner",
    "eigentum": r"eigentuemerquote",
    "baujahr": r"baujahr_jz",
}
NULL_ERLAUBT = {"leerstand", "eigentum"}


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


def zahl(text):
    """„12,5“ → 12.5; „–“ (nichts vorhanden) oder leer → None"""
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return None


w, s, o, n = GEBIET
ecken = [laea(lon, lat) for lon, lat in [(w, s), (o, s), (o, n), (w, n)]]
x0, x1 = min(p[0] for p in ecken) - 100, max(p[0] for p in ecken) + 100
y0, y1 = min(p[1] for p in ecken) - 100, max(p[1] for p in ecken) + 100

ergebnis = {}
for pfad in glob.glob(os.path.join(sys.argv[1], "*.zip")):
    z = zipfile.ZipFile(pfad)
    for name in z.namelist():
        kurz = name.split("/")[-1].lower()
        if "100m" not in kurz or not kurz.endswith(".csv"):
            continue
        merkmal = next((m for m, muster in MERKMALE.items() if re.search(muster, kurz)), None)
        if not merkmal:
            continue
        zellen = []
        with z.open(name) as f:
            text = io.TextIOWrapper(f, encoding="utf-8", errors="replace")
            next(text)
            for zeile in text:
                t = zeile.rstrip("\r\n").split(";")
                x, y = int(t[1]), int(t[2])
                if not (x0 <= x <= x1 and y0 <= y <= y1):
                    continue
                if merkmal == "baujahr":
                    # Gebäude je Baujahrzehnt: vor 1919, 1919–49, 50er … 2010–15, ab 2016
                    anzahl = [int(zahl(v) or 0) for v in t[4:14]]
                    if sum(anzahl):
                        zellen.append([x, y, anzahl])
                else:
                    # „–“ = genau null: bei Quoten 0 %, bei Miete und Fläche ohne Aussage (übersprungen)
                    wert = 0.0 if merkmal in NULL_ERLAUBT and t[3].strip() == "–" else zahl(t[3])
                    if wert is not None:
                        # [Mitte Ost, Mitte Nord, Wert, 1 = unsicherer Wert (in Klammern)]
                        zellen.append([x, y, wert, 1 if len(t) > 4 and t[4].strip() else 0])
        ergebnis[merkmal] = zellen
        werte = [c[2] for c in zellen if merkmal != "baujahr"]
        print(f"{merkmal}: {len(zellen)} Zellen", f"({min(werte)}–{max(werte)})" if werte else "")

# Miete vergleichbarer Wohnungen (nach Baualter und Größe) aus den Kacheln der destatis-Seite „Mietvergleich“
# (gleiche Kacheln wie ladeDestatis() in zensus.js). Zellen: linke untere Ecke → +50 m = Zellmitte.
import urllib.request
KACHEL_URL = "https://service.destatis.de/DE/konferenzen/NIAM2026/tiled_data_Gebalter_Wohngr65qm_Miete_zusatz_js/"
UX, UY, KACHEL = 4031700, 2691200, 12500
VERGLEICH = ["alt_1990_und_frueher__klein_65qm_und_weniger", "alt_1990_und_frueher__gross_ueber_65qm",
             "jung_nach_1990__klein_65qm_und_weniger", "jung_nach_1990__gross_ueber_65qm"]
vergleich = []
for xt in range(int((x0 - UX) // KACHEL), int((x1 - UX) // KACHEL) + 1):
    for yt in range(int((y0 - UY) // KACHEL), int((y1 - UY) // KACHEL) + 1):
        text = urllib.request.urlopen(f"{KACHEL_URL}{xt}/{yt}.js", timeout=30).read().decode("utf-8")
        zeilen = text.strip().split("\n")
        kopf = zeilen[0].split(",")
        for zeile in zeilen[1:]:
            d = dict(zip(kopf, zeile.split(",")))
            x = UX + (xt * 125 + int(d["x"])) * 100 + 50
            y = UY + (yt * 125 + int(d["y"])) * 100 + 50
            werte = [float(d[k]) if d[k] else None for k in VERGLEICH]
            if x0 <= x <= x1 and y0 <= y <= y1 and any(w is not None for w in werte):
                # [Mitte Ost, Mitte Nord, vor 1991 bis 65 m², vor 1991 über 65 m², ab 1991 bis 65 m², ab 1991 über 65 m²]
                vergleich.append([x, y, *werte])
ergebnis["vergleich"] = vergleich
print("vergleich:", len(vergleich), "Zellen")

with open(sys.argv[2], "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Eingebaute Beispieldaten: Zensus 2022 (Stichtag 15.05.2022), 100-m-Gitterzellen, Oldenburg Innenstadt.\n"
            " * Merkmale: Nettokaltmiete (€/m²), Leerstandsquote (%), Fläche je Wohnung und je Bewohner (m²),\n"
            " * Eigentümerquote (%), Gebäude nach Baujahrzehnt, Miete vergleichbarer Wohnungen nach Baualter und Größe\n"
            " * (destatis „Mietvergleich“). Koordinaten = Zellmitte in EPSG:3035.\n"
            " * Quelle: Statistische Ämter des Bundes und der Länder, Zensus 2022 (dl-de/by-2-0).\n"
            " * Erzeugt mit werkzeuge/zensus_beispiel.py. Wird von zensus.js geladen.\n */\n"
            "window.BEISPIEL_ZENSUS = ")
    json.dump({"epsg": 3035, "zellgroesse": 100, "stichtag": "2022-05-15", "merkmale": ergebnis}, f, separators=(",", ":"))
    f.write(";\n")
