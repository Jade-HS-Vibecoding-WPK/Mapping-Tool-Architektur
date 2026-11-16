/* ============================================================
   Ortsanalyse – OSM-Daten laden und aufbereiten
   1. Daten für ein Rechteck bei der Overpass-API abfragen
      (oder die eingebauten Beispieldaten von Oldenburg nehmen)
   2. In GeoJSON umwandeln (Bibliothek osmtogeojson)
   3. Auf das Rechteck zuschneiden und in Kategorien einteilen:
      Gebäude, Straßen, Bahn, Grün, Wasser, Bäume, Verkehrsflächen
   ============================================================ */

// Overpass-Server: Ist der erste überlastet, wird der nächste versucht.
const OVERPASS_SERVER = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

// Das Oldenburger Testgebiet (= Ausschnitt der topoexport-Beispieldateien)
// als [West, Süd, Ost, Nord] in Längen-/Breitengraden.
const BEISPIEL_GEBIET = [8.205884, 53.135548, 8.221177, 53.144717];

// ---------- 1. Abfrage ----------

// Die Frage an Overpass: „Gib mir alle Gebäude, Straßen, Grünflächen … in diesem Rechteck.“
function overpassAbfrage([west, sued, ost, nord]) {
  return `[out:json][timeout:120][bbox:${sued},${west},${nord},${ost}];
(
  nwr["building"];
  way["highway"];
  nwr["area:highway"];
  way["railway"~"^(rail|tram|light_rail|subway|narrow_gauge)$"];
  nwr["landuse"~"^(forest|grass|meadow|village_green|recreation_ground|cemetery|allotments|railway|basin|reservoir|orchard|flowerbed)$"];
  nwr["leisure"~"^(park|garden|nature_reserve)$"];
  nwr["natural"~"^(wood|scrub|grassland|heath|wetland|water|tree)$"];
  nwr["waterway"];
  nwr["amenity"="parking"];
);
out body;
>;
out skel qt;`;
}

// Fragt die Server der Reihe nach. meldung(text) zeigt den Fortschritt an.
async function ladeOsm(bbox, meldung) {
  const abfrage = overpassAbfrage(bbox);
  let letzterFehler = null;
  for (const [i, server] of OVERPASS_SERVER.entries()) {
    meldung(`Lade OSM-Daten (Server ${i + 1} von ${OVERPASS_SERVER.length}) … das kann bis zu 2 Minuten dauern.`);
    const abbruch = new AbortController();
    const zeitlimit = setTimeout(() => abbruch.abort(), 150_000);
    try {
      const antwort = await fetch(server, {
        method: "POST",
        body: new URLSearchParams({ data: abfrage }),
        signal: abbruch.signal
      });
      if (!antwort.ok) throw new Error(`Server antwortet mit Fehler ${antwort.status}`);
      const json = await antwort.json();
      // Overpass meldet Zeitüberschreitungen manchmal als „remark“ statt als Fehler
      if (json.remark && /error|timeout|runtime/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (fehler) {
      letzterFehler = fehler;
      console.warn("Overpass-Server nicht erreichbar:", server, fehler);
    } finally {
      clearTimeout(zeitlimit);
    }
  }
  throw letzterFehler || new Error("Kein Overpass-Server erreichbar");
}

// Lädt die eingebauten Oldenburger Daten (Datei data/beispiel-oldenburg-osm.js).
// Als <script> statt per fetch, damit es auch beim Öffnen der Datei ohne Server klappt.
function ladeBeispielOsm() {
  if (window.BEISPIEL_OSM) return Promise.resolve(window.BEISPIEL_OSM);
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = "data/beispiel-oldenburg-osm.js";
    s.onload = () => ok(window.BEISPIEL_OSM);
    s.onerror = () => fehler(new Error("Beispieldaten nicht gefunden"));
    document.head.appendChild(s);
  });
}

// Liegt das Rechteck vollständig im Oldenburger Beispielgebiet?
function liegtImBeispielgebiet([w, s, o, n]) {
  const [bw, bs, bo, bn] = BEISPIEL_GEBIET;
  return w >= bw - 1e-6 && s >= bs - 1e-6 && o <= bo + 1e-6 && n <= bn + 1e-6;
}

// ---------- 2. Kategorien ----------

const STRASSEN_KATEGORIEN = {
  haupt: "Hauptstraße",
  neben: "Nebenstraße",
  wohn: "Wohn- und Erschließungsstraße",
  fuss: "Fuß- und Radweg"
};

// highway-Wert → [Kategorie, typische Breite des Straßenraums in m]
// Die Breite wird nur für die Schätzung der Verkehrsfläche (netto) gebraucht.
const STRASSEN_TYPEN = {
  motorway: ["haupt", 24], trunk: ["haupt", 22], primary: ["haupt", 18], secondary: ["haupt", 16],
  motorway_link: ["haupt", 8], trunk_link: ["haupt", 8], primary_link: ["haupt", 8], secondary_link: ["haupt", 8],
  tertiary: ["neben", 13], tertiary_link: ["neben", 7], unclassified: ["neben", 10],
  residential: ["wohn", 10], living_street: ["wohn", 8], road: ["wohn", 8], service: ["wohn", 5],
  pedestrian: ["fuss", 8], footway: ["fuss", 2.5], cycleway: ["fuss", 2.5], path: ["fuss", 2],
  steps: ["fuss", 2], bridleway: ["fuss", 3], track: ["fuss", 3]
};

const GRUEN_KATEGORIEN = {
  park: "Park, Garten, Friedhof",
  wald: "Wald",
  wiese: "Wiese, Rasen",
  wasser: "Wasser"
};

const NUTZUNGEN = {
  wohnen: "Wohnen",
  gewerbe: "Handel, Gewerbe, Büro",
  oeffentlich: "Öffentlich, Bildung",
  kirche: "Kirche, Religion",
  sonstige: "Sonstige (Parkhaus, Technik …)",
  unbekannt: "Unbekannt"
};

// building-Werte, die als Nebengebäude/Überdachung zählen (grau im Schwarzplan)
const NEBENGEBAEUDE = new Set(["garage", "garages", "carport", "shed", "roof", "hut", "greenhouse",
  "service", "transformer_tower", "toilets", "allotment_house", "cabin", "shelter"]);
const WOHNEN = new Set(["house", "residential", "apartments", "detached", "semidetached_house", "terrace",
  "bungalow", "dormitory", "farm", "villa"]);
const GEWERBE = new Set(["retail", "commercial", "office", "industrial", "warehouse", "supermarket",
  "hotel", "kiosk", "manufacture", "factory"]);
const OEFFENTLICH = new Set(["public", "civic", "school", "university", "college", "kindergarten", "hospital",
  "government", "townhall", "train_station", "fire_station", "museum", "library", "sports_hall", "theatre"]);
const RELIGION = new Set(["church", "chapel", "cathedral", "religious", "mosque", "synagogue", "temple", "monastery"]);
const OEFF_AMENITY = new Set(["school", "university", "college", "kindergarten", "hospital", "townhall",
  "library", "theatre", "courthouse", "police", "fire_station", "community_centre", "arts_centre"]);

function nutzung(t) {
  const b = t.building;
  if (t.amenity === "place_of_worship" || RELIGION.has(b)) return "kirche";
  if (OEFFENTLICH.has(b) || OEFF_AMENITY.has(t.amenity)) return "oeffentlich";
  if (WOHNEN.has(b)) return "wohnen";
  if (GEWERBE.has(b) || t.shop || t.office || t.tourism === "hotel") return "gewerbe";
  if (b === "parking" || b === "transportation" || b === "construction") return "sonstige";
  return "unbekannt";
}

// Geschosszahl: 1. aus OSM, 2. aus der Höhe (÷ 3 m), 3. Ersatzwert 2 (= geschätzt)
const ERSATZ_GESCHOSSE = 2;
function geschosse(t) {
  const zahl = (wert) => parseFloat(String(wert || "").replace(",", "."));
  const ebenen = zahl(t["building:levels"]);
  if (ebenen > 0) return { wert: Math.round(ebenen), quelle: "osm" };
  const hoehe = zahl(t.height);
  if (hoehe > 0) return { wert: Math.max(1, Math.round(hoehe / 3)), quelle: "hoehe" };
  return { wert: ERSATZ_GESCHOSSE, quelle: "ersatz" };
}

function gruenKategorie(t) {
  if (t.natural === "water" || t.water || t.waterway === "riverbank" || t.waterway === "dock" ||
      t.landuse === "basin" || t.landuse === "reservoir") return "wasser";
  if (t.natural === "wood" || t.landuse === "forest") return "wald";
  if (["park", "garden", "nature_reserve"].includes(t.leisure) ||
      ["cemetery", "allotments", "orchard"].includes(t.landuse)) return "park";
  if (["grass", "meadow", "village_green", "recreation_ground", "flowerbed"].includes(t.landuse) ||
      ["grassland", "scrub", "heath", "wetland"].includes(t.natural)) return "wiese";
  return null;
}

// ---------- 3. Aufbereiten ----------

const istFlaeche = (g) => g && (g.type === "Polygon" || g.type === "MultiPolygon");
const istLinie = (g) => g && (g.type === "LineString" || g.type === "MultiLineString");

// Ein Objekt auf das Rechteck zuschneiden. Gibt null zurück, wenn nichts übrig bleibt.
function schneide(feature, bbox) {
  const g = feature.geometry;
  let ergebnis;
  try {
    ergebnis = turf.bboxClip(feature, bbox);
  } catch (e) {
    return null;
  }
  const geo = ergebnis.geometry;
  if (geo.type === "Polygon") {
    geo.coordinates = geo.coordinates.filter((ring) => ring.length >= 4);
    if (!geo.coordinates.length) return null;
  } else if (geo.type === "MultiPolygon") {
    geo.coordinates = geo.coordinates
      .map((poly) => poly.filter((ring) => ring.length >= 4))
      .filter((poly) => poly.length);
    if (!geo.coordinates.length) return null;
  } else if (geo.type === "LineString") {
    if (geo.coordinates.length < 2) return null;
  } else if (geo.type === "MultiLineString") {
    geo.coordinates = geo.coordinates.filter((linie) => linie.length >= 2);
    if (!geo.coordinates.length) return null;
  }
  if (istFlaeche(g) && turf.area(ergebnis) < 0.5) return null;
  return ergebnis;
}

function sammlung(features) {
  return { type: "FeatureCollection", features };
}

// Hauptfunktion: rohe Overpass-Antwort → aufbereitete Ebenen
function bereiteAuf(rohdaten, bbox) {
  const geojson = osmtogeojson(rohdaten);
  const [west, sued, ost, nord] = bbox;
  const imGebiet = ([x, y]) => x >= west && x <= ost && y >= sued && y <= nord;

  const ebenen = {
    gebaeude: [], strassen: [], bahn: [], gruen: [], wasserLinien: [], baeume: [], verkehrsflaechen: []
  };

  for (const f of geojson.features) {
    const t = f.properties.tags || f.properties; // je nach osmtogeojson-Version
    const g = f.geometry;
    if (!g) continue;
    const id = f.id || f.properties.id;

    // Einzelbäume
    if (g.type === "Point") {
      if (t.natural === "tree" && imGebiet(g.coordinates)) {
        const krone = parseFloat(t.diameter_crown);
        ebenen.baeume.push({ type: "Feature", geometry: g,
          properties: { id, kronenradius: krone > 0 ? krone / 2 : 4, kroneGeschaetzt: !(krone > 0) } });
      }
      continue;
    }

    // Gebäude
    if (t.building && t.building !== "no" && istFlaeche(g)) {
      if (t.location === "underground" || t.building === "underground") continue;
      if (String(id).startsWith("relation") && t.type && t.type !== "multipolygon") continue;
      const teil = schneide(f, bbox);
      if (!teil) continue;
      const neben = NEBENGEBAEUDE.has(t.building);
      const gs = neben ? { wert: 1, quelle: "osm" } : geschosse(t);
      teil.properties = {
        id, art: neben ? "neben" : "haupt",
        nutzung: neben ? "neben" : nutzung(t),
        geschosse: gs.wert, geschosseQuelle: gs.quelle,
        flaeche: turf.area(teil)
      };
      ebenen.gebaeude.push(teil);
      continue;
    }

    // Straßen (Linien)
    if (t.highway && istLinie(g) && STRASSEN_TYPEN[t.highway]) {
      if (t.indoor === "yes" || t.highway === "corridor") continue;
      const teil = schneide(f, bbox);
      if (!teil) continue;
      const [kategorie, breite] = STRASSEN_TYPEN[t.highway];
      teil.properties = { id, kategorie, breite, laenge: turf.length(teil, { units: "meters" }) };
      ebenen.strassen.push(teil);
      continue;
    }

    // Bahn (Linien)
    if (t.railway && istLinie(g)) {
      const teil = schneide(f, bbox);
      if (!teil) continue;
      // Straßenbahnen liegen in der Straße: keine eigene Bahnfläche
      teil.properties = { id, art: t.railway, breite: t.railway === "tram" ? 0 : 8 };
      ebenen.bahn.push(teil);
      continue;
    }

    if (!istFlaeche(g)) {
      // Fließgewässer als Linien (Fluss, Kanal, Bach, Graben)
      if (t.waterway && ["river", "canal", "stream", "ditch", "drain"].includes(t.waterway) && istLinie(g)) {
        const teil = schneide(f, bbox);
        if (!teil) continue;
        const breite = { river: 20, canal: 15, stream: 3, ditch: 2, drain: 2 }[t.waterway];
        teil.properties = { id, art: t.waterway, breite };
        ebenen.wasserLinien.push(teil);
      }
      continue;
    }

    // Ab hier nur Flächen
    // Verkehrsflächen: Parkplätze, Fußgängerzonen als Fläche, Straßenflächen
    const parkplatz = t.amenity === "parking" && !["underground", "multi-storey", "rooftop"].includes(t.parking);
    if (parkplatz || t["area:highway"] || t.highway) {
      const teil = schneide(f, bbox);
      if (teil) { teil.properties = { id, art: parkplatz ? "parkplatz" : "strassenflaeche" }; ebenen.verkehrsflaechen.push(teil); }
      continue;
    }

    // Bahnflächen
    if (t.landuse === "railway") {
      const teil = schneide(f, bbox);
      if (teil) { teil.properties = { id, art: "bahnflaeche", breite: 0 }; ebenen.bahn.push(teil); }
      continue;
    }

    // Grün und Wasser
    const kategorie = gruenKategorie(t);
    if (kategorie) {
      const teil = schneide(f, bbox);
      if (teil) { teil.properties = { id, kategorie }; ebenen.gruen.push(teil); }
    }
  }

  // Als GeoJSON-Sammlungen zurückgeben
  const ergebnis = {};
  for (const [name, liste] of Object.entries(ebenen)) ergebnis[name] = sammlung(liste);
  ergebnis.datenstand = rohdaten.osm3s && rohdaten.osm3s.timestamp_osm_base;
  return ergebnis;
}
