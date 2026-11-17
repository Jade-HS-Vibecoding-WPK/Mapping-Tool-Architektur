"""Lädt die Infrastruktur-Punkte (Haltestellen, Spielplätze, Läden …) für das Oldenburger Beispiel aus OpenStreetMap.

Gleiche Overpass-Abfrage wie infraAbfrage() in infrastruktur.js (bei Änderungen beide anpassen).
Gespeichert werden Lage und die für die Einordnung nötigen Merkmale, keine Personen- oder Adressdaten.
Quelle: © OpenStreetMap-Mitwirkende, ODbL.

    python werkzeuge/infra_beispiel.py data/beispiel-oldenburg-infra.js
"""
import json, sys, urllib.parse, urllib.request
from datetime import date

GEBIET = (8.205884, 53.135548, 8.221177, 53.144717)  # wie in osm.js
SERVER = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
          "https://overpass.private.coffee/api/interpreter"]
MERKMALE = ["amenity", "shop", "highway", "railway", "public_transport", "leisure", "tourism", "historic",
            "parking", "healthcare", "bus", "tram", "train", "name"]

w, s, o, n = GEBIET
abfrage = f"""[out:json][timeout:90][bbox:{s},{w},{n},{o}];
(
  nwr["highway"="bus_stop"];
  nwr["railway"~"^(tram_stop|station|halt)$"];
  nwr["public_transport"="platform"];
  nwr["amenity"~"^(bicycle_parking|bicycle_rental|car_sharing|charging_station|taxi|school|kindergarten|childcare|university|college|library|community_centre|social_facility|pharmacy|doctors|dentist|clinic|hospital|post_office|bank|atm|theatre|cinema|arts_centre|place_of_worship|cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|bench|toilets|drinking_water|waste_basket)$"];
  nwr["amenity"="parking"]["parking"~"^(multi-storey|underground)$"];
  nwr["leisure"~"^(playground|pitch|sports_centre|fitness_station)$"];
  nwr["shop"~"^(supermarket|convenience|bakery)$"];
  nwr["tourism"~"^(museum|gallery)$"];
  nwr["historic"~"^(monument|memorial)$"];
);
out center tags;"""

daten = None
for server in SERVER:
    try:
        anfrage = urllib.request.Request(server, data=urllib.parse.urlencode({"data": abfrage}).encode(),
                                         headers={"User-Agent": "Ortsanalyse-Beispieldaten"})
        daten = json.load(urllib.request.urlopen(anfrage, timeout=120))
        break
    except Exception as fehler:
        print("Server nicht erreichbar:", server, fehler)
if daten is None:
    raise SystemExit("Kein Overpass-Server erreichbar")

punkte = []
for e in daten["elements"]:
    lon, lat = (e["lon"], e["lat"]) if "lon" in e else (e["center"]["lon"], e["center"]["lat"])
    tags = {k: v for k, v in e.get("tags", {}).items() if k in MERKMALE}
    punkte.append([round(lon, 6), round(lat, 6), e["type"][0] + str(e["id"]), tags])
print("Punkte:", len(punkte))

with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Eingebaute Beispieldaten: Infrastruktur-Punkte (Haltestellen, Spielplätze, Läden …), Oldenburg Innenstadt.\n"
            f" * Stand {date.today().isoformat()}. Quelle: © OpenStreetMap-Mitwirkende (ODbL), abgefragt über die Overpass-API.\n"
            " * Erzeugt mit werkzeuge/infra_beispiel.py. Wird von infrastruktur.js geladen.\n */\n"
            "window.BEISPIEL_INFRA = ")
    json.dump({"stand": date.today().isoformat(), "punkte": punkte}, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
