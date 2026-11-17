"""Erzeugt piktogramme.js aus den freien Karten-Symbolen „Maki“ (Mapbox, Lizenz CC0).

Lädt die benötigten SVG-Dateien von unpkg und speichert nur die Pfade (viewBox 15 × 15),
damit das Tool die Symbole ohne Internetzugriff zeichnen kann.

    python werkzeuge/piktogramme.py piktogramme.js
"""
import json, re, sys, urllib.request

VERSION = "8.0.1"
NAMEN = [
    "bus", "rail-light", "rail", "bicycle", "bicycle-share", "car-rental", "charging-station", "parking-garage", "car",
    "school", "college", "library", "playground", "pitch", "fitness-centre", "home", "heart",
    "grocery", "convenience", "bakery", "pharmacy", "doctor", "dentist", "hospital", "post", "bank",
    "museum", "theatre", "cinema", "art-gallery", "place-of-worship", "monument",
    "cafe", "restaurant", "bar", "beer", "fast-food", "ice-cream",
    "picnic-site", "toilet", "drinking-water", "waste-basket",
]

symbole = {}
for name in NAMEN:
    url = f"https://unpkg.com/@mapbox/maki@{VERSION}/icons/{name}.svg"
    svg = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")
    pfade = re.findall(r'<path[^>]*\sd="([^"]+)"', svg)
    if not pfade:
        raise SystemExit(f"keine Pfade in {name}")
    symbole[name] = " ".join(pfade)
    print(name, len(symbole[name]))

with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Piktogramme: Maki-Symbole von Mapbox (https://github.com/mapbox/maki), Lizenz CC0 (gemeinfrei).\n"
            " * Nur die SVG-Pfade, viewBox 0 0 15 15. Erzeugt mit werkzeuge/piktogramme.py, genutzt von infrastruktur.js.\n */\n"
            f"const MAKI = {json.dumps(symbole, indent=1, ensure_ascii=False)};\n")
