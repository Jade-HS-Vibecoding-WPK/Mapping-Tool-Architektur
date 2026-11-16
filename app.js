/* ============================================================
   Ortsanalyse – Logik
   1. Karte von Oldenburg anzeigen (schwarz-weiß)
   2. Rechteck aufziehen und Größe anzeigen
   3. Reiter (Tabs) für die Ansichten umschalten
   4. OpenStreetMap-Daten laden (Overpass) und einsortieren
   5. Pläne zeichnen: Schwarzplan, Straßennetz, Grün, Lageplan
   6. LoD2-Dachformen vom LGLN laden (Hintergrundprogramm lod2-worker.js) und im Lageplan zeigen
   7. Amtliche Straßen-, Weg- und Platzflächen (ALKIS, LGLN) als nachgezeichnete Flächen
   ============================================================ */

const MAX_FLAECHE_M2 = 1_000_000; // höchstens 1 km²
const OLDENBURG = [8.2146, 53.1395]; // Mitte der Innenstadt (Länge, Breite)

// ---------- 1. Karte ----------
const map = new maplibregl.Map({
  container: "map",
  center: OLDENBURG,
  zoom: 15,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>'
      }
    },
    layers: [
      { id: "papier", type: "background", paint: { "background-color": "#ffffff" } },
      {
        id: "osm",
        type: "raster",
        source: "osm",
        // Karte grau und hell darstellen, damit sie im Hintergrund bleibt
        paint: { "raster-saturation": -1, "raster-contrast": -0.15, "raster-brightness-min": 0.15, "raster-opacity": 0.85 }
      }
    ]
  }
});

// Bedienelemente: Zoom und Nordpfeil (Kompass), Maßstabsleiste, Quellenangabe
map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: "metric" }), "bottom-left");
map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");

// ---------- 2. Rechteck aufziehen ----------
const btnDraw = document.getElementById("btn-draw");
const btnClear = document.getElementById("btn-clear");
const btnAnalyse = document.getElementById("btn-analyse");
const analyseHint = document.getElementById("analyse-hint");
const mapMode = document.getElementById("map-mode");
const areaInfo = document.getElementById("area-info");
const areaDims = document.getElementById("area-dims");
const areaSize = document.getElementById("area-size");
const areaWarning = document.getElementById("area-warning");

let zeichnen = false;     // ist der Zeichenmodus an?
let startPunkt = null;    // erste Ecke des Rechtecks
let gebiet = null;        // das fertige Rechteck (als GeoJSON-Fläche)

const leer = { type: "FeatureCollection", features: [] };

// Ebenen anlegen, sobald die Karte bereit ist. Die Reihenfolge ist wichtig:
// was später kommt, liegt weiter oben.
// Unten: Daten der Pläne (Abschnitt 5), darüber die weiße "Maske", ganz oben das Rechteck.
let kartenBereit = false;
map.on("load", () => {
  legePlanEbenenAn();
  map.addSource("gebiet", { type: "geojson", data: leer });
  map.addLayer({ id: "gebiet-flaeche", type: "fill", source: "gebiet",
    paint: { "fill-color": "#e2482d", "fill-opacity": 0.08 } });
  map.addLayer({ id: "gebiet-rand", type: "line", source: "gebiet",
    paint: { "line-color": "#e2482d", "line-width": 2, "line-dasharray": [3, 2] } });
  kartenBereit = true;
  wendeAnsichtAn();
});

// Aus zwei Ecken ein Rechteck machen
function rechteck(a, b) {
  const west = Math.min(a.lng, b.lng), ost = Math.max(a.lng, b.lng);
  const sued = Math.min(a.lat, b.lat), nord = Math.max(a.lat, b.lat);
  return turf.bboxPolygon([west, sued, ost, nord]);
}

function zeigeRechteck(feature) {
  map.getSource("gebiet").setData(feature ? { type: "FeatureCollection", features: [feature] } : leer);
}

function zeichenmodus(an) {
  zeichnen = an;
  btnDraw.classList.toggle("is-active", an);
  btnDraw.textContent = an ? "Zeichnen abbrechen" : "Rechteck zeichnen";
  mapMode.hidden = !an;
  document.body.classList.toggle("is-drawing", an);
  // Während des Zeichnens darf die Karte nicht verschoben werden
  if (an) { map.dragPan.disable(); map.boxZoom.disable(); }
  else { map.dragPan.enable(); map.boxZoom.enable(); }
}

// Zahlen deutsch formatieren (1.234,5)
const zahl = (wert, stellen = 0) => wert.toLocaleString("de-DE", { maximumFractionDigits: stellen, minimumFractionDigits: stellen });

function aktualisiereAngaben(feature) {
  if (!feature) {
    areaInfo.hidden = true;
    areaWarning.hidden = true;
    btnClear.disabled = true;
    btnAnalyse.disabled = true;
    analyseHint.textContent = "Zuerst ein Gebiet wählen.";
    return;
  }
  const [west, sued, ost, nord] = turf.bbox(feature);
  const breite = turf.distance([west, sued], [ost, sued], { units: "meters" });
  const hoehe = turf.distance([west, sued], [west, nord], { units: "meters" });
  const flaeche = turf.area(feature);

  areaInfo.hidden = false;
  areaDims.textContent = `${zahl(breite)} × ${zahl(hoehe)} m`;
  areaSize.textContent = flaeche >= 10_000 ? `${zahl(flaeche / 10_000, 1)} ha` : `${zahl(flaeche)} m²`;

  const zuGross = flaeche > MAX_FLAECHE_M2;
  areaWarning.hidden = !zuGross;
  btnClear.disabled = false;
  btnAnalyse.disabled = zuGross;
  analyseHint.textContent = zuGross ? "Gebiet zu groß (höchstens 1 km²)." : "Bereit. Klicke auf „Analysieren“.";
}

btnDraw.addEventListener("click", () => {
  // Gezeichnet wird nur auf der Karte, nicht in den Plänen (dort ist die Hintergrundkarte aus)
  if (!zeichnen) zeigeAnsicht("karte");
  zeichenmodus(!zeichnen);
});

btnClear.addEventListener("click", () => {
  gebiet = null;
  verwerfeDaten();
  zeigeRechteck(null);
  aktualisiereAngaben(null);
  wendeAnsichtAn();
});

// Maus/Finger: drücken = erste Ecke, ziehen = Vorschau, loslassen = fertig
map.on("mousedown", (e) => beginne(e));
map.on("touchstart", (e) => { if (e.points.length === 1) beginne(e); });
map.on("mousemove", (e) => ziehe(e));
map.on("touchmove", (e) => ziehe(e));
map.on("mouseup", (e) => beende(e));
map.on("touchend", (e) => beende(e));

function beginne(e) {
  if (!zeichnen) return;
  e.preventDefault();
  startPunkt = e.lngLat;
}

function ziehe(e) {
  if (!zeichnen || !startPunkt) return;
  const vorschau = rechteck(startPunkt, e.lngLat);
  zeigeRechteck(vorschau);
  aktualisiereAngaben(vorschau);
}

function beende(e) {
  if (!zeichnen || !startPunkt) return;
  const ende = e.lngLat || startPunkt;
  const fertig = rechteck(startPunkt, ende);
  startPunkt = null;
  // Ein einfacher Klick ohne Ziehen erzeugt kein Gebiet
  if (turf.area(fertig) < 100) {
    zeigeRechteck(gebiet);
    aktualisiereAngaben(gebiet);
    return;
  }
  gebiet = fertig;
  verwerfeDaten(); // alte Daten passen nicht mehr zum neuen Rechteck
  zeigeRechteck(gebiet);
  aktualisiereAngaben(gebiet);
  zeichenmodus(false);
  map.fitBounds(turf.bbox(gebiet), { padding: 60, duration: 600 });
}

// Esc bricht das Zeichnen ab
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && zeichnen) {
    startPunkt = null;
    zeigeRechteck(gebiet);
    aktualisiereAngaben(gebiet);
    zeichenmodus(false);
  }
});

// ---------- 3. Reiter (Tabs) ----------
// Fünf Reiter benutzen dieselbe Karte und schalten nur Ebenen um (siehe ANSICHTEN unten).
// 3D und Kennzahlen sind noch Platzhalter-Seiten.
const KARTEN_REITER = ["karte", "schwarzplan", "strassen", "gruen", "lageplan"];
let aktuelleAnsicht = "karte";

function zeigeAnsicht(ziel) {
  aktuelleAnsicht = ziel;
  const istKarte = KARTEN_REITER.includes(ziel);
  // Wer den Reiter wechselt, während er zeichnet, bricht das Zeichnen ab
  if (ziel !== "karte" && zeichnen) {
    startPunkt = null;
    zeigeRechteck(gebiet);
    aktualisiereAngaben(gebiet);
    zeichenmodus(false);
  }
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === ziel));
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("is-active", v.dataset.view === (istKarte ? "karte" : ziel)));
  if (istKarte) {
    map.resize(); // Karte nach dem Wiedereinblenden neu ausmessen
    wendeAnsichtAn();
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => zeigeAnsicht(tab.dataset.view));
});

// ---------- 4. Daten von OpenStreetMap laden ----------
// Overpass ist die kostenlose Abfrage-Schnittstelle von OpenStreetMap. Wir schicken ihr das Rechteck
// und bekommen alle Gebäude, Straßen, Grünflächen, Gewässer und Bäume darin zurück.
// Drei öffentliche Server, die wir gleichzeitig fragen. Der schnellste, der Daten liefert, gewinnt,
// die anderen Abfragen werden abgebrochen. So bremst ein langsamer oder ausgefallener Server nicht.
const OVERPASS_SERVER = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const ABFRAGE_LIMIT_MS = 75_000;

// Welche OSM-Merkmale zu welcher Kategorie gehören
const NEBENGEBAEUDE = new Set(["garage", "garages", "carport", "shed", "roof", "hut", "cabin", "greenhouse", "service", "kiosk", "container", "outbuilding"]);
const STRASSENTYP = {
  motorway: "haupt", motorway_link: "haupt", trunk: "haupt", trunk_link: "haupt", primary: "haupt", primary_link: "haupt",
  secondary: "sammel", secondary_link: "sammel", tertiary: "sammel", tertiary_link: "sammel",
  residential: "wohn", unclassified: "wohn", living_street: "wohn",
  service: "service",
  pedestrian: "fuss", footway: "fuss", path: "fuss", cycleway: "fuss", steps: "fuss", track: "fuss", bridleway: "fuss"
};
const GRUEN_LEISURE = new Set(["park", "garden", "pitch", "playground", "recreation_ground", "nature_reserve", "golf_course", "common", "dog_park"]);
const GRUEN_LANDUSE = new Set(["grass", "forest", "meadow", "orchard", "vineyard", "cemetery", "village_green", "recreation_ground", "allotments", "flowerbed", "greenfield"]);
const GRUEN_NATURAL = new Set(["wood", "scrub", "grassland", "heath", "wetland"]);
const WASSER_LANDUSE = new Set(["basin", "reservoir"]);
const WASSERLINIEN = new Set(["river", "stream", "canal", "ditch", "drain"]);
const UNTERIRDISCH = new Set(["yes", "culvert", "building_passage"]);

function overpassAbfrage(sued, west, nord, ost) {
  const b = [sued, west, nord, ost].map((z) => z.toFixed(6)).join(",");
  // Baut z. B. ["landuse"~"^(grass|forest)$"] aus einem Merkmal und einer Liste erlaubter Werte
  const werte = (merkmal, liste) => `["${merkmal}"~"^(${[...liste].join("|")})$"]`;
  const leisure = werte("leisure", GRUEN_LEISURE);
  const landuse = werte("landuse", [...GRUEN_LANDUSE, ...WASSER_LANDUSE]);
  const natural = werte("natural", [...GRUEN_NATURAL, "water"]);
  const waterway = werte("waterway", [...WASSERLINIEN, "riverbank", "dock"]);
  return `[out:json][timeout:60];
(
  way["building"](${b});
  relation["building"](${b});
  way["highway"](${b});
  way${leisure}(${b});
  relation${leisure}(${b});
  way${landuse}(${b});
  relation${landuse}(${b});
  way${natural}(${b});
  relation${natural}(${b});
  way${waterway}(${b});
  relation["waterway"="riverbank"](${b});
  node["natural"="tree"](${b});
);
out geom qt;`;
}

// Fragt einen Server; wirft einen Fehler, wenn es nicht klappt.
// "stopp" ist das Signal, mit dem wir die Abfrage abbrechen, sobald ein anderer Server schneller war.
async function frageServer(url, abfrage, stopp) {
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), ABFRAGE_LIMIT_MS);
  stopp.addEventListener("abort", () => abbruch.abort(), { once: true });
  try {
    const antwort = await fetch(url, { method: "POST", body: new URLSearchParams({ data: abfrage }), signal: abbruch.signal });
    if (!antwort.ok) throw new Error(`Server meldet Fehler ${antwort.status}`);
    const daten = await antwort.json();
    // Ist der Server überlastet, antwortet er manchmal "ok", aber mit einer Bemerkung statt mit Daten
    if (daten.remark && /error|timed out|out of memory/i.test(daten.remark) && !(daten.elements || []).length) {
      throw new Error("Server überlastet");
    }
    return daten;
  } finally {
    clearTimeout(wecker);
  }
}

async function holeOsmDaten(sued, west, nord, ost) {
  const abfrage = overpassAbfrage(sued, west, nord, ost);
  const stopp = new AbortController();
  const fehlerListe = [];
  const versuche = OVERPASS_SERVER.map((url) =>
    frageServer(url, abfrage, stopp.signal).catch((fehler) => {
      fehlerListe.push(fehler);
      if (!stopp.signal.aborted) console.warn("Overpass-Abfrage fehlgeschlagen:", url, fehler);
      throw fehler;
    }));
  try {
    return await Promise.any(versuche); // der erste erfolgreiche gewinnt
  } catch (_) {
    if (!navigator.onLine) throw new Error("Keine Internetverbindung. Bitte Verbindung prüfen und noch einmal versuchen.");
    throw new Error("Der Datendienst von OpenStreetMap antwortet gerade nicht (" + (fehlerListe[0]?.message || "unbekannter Fehler") +
      "). Bitte in einer Minute noch einmal versuchen oder ein kleineres Gebiet wählen.");
  } finally {
    stopp.abort(); // die langsameren Abfragen abbrechen
  }
}

// Sortiert jedes Objekt in eine Kategorie. Gibt null zurück, wenn es uns nicht interessiert.
function kategorisiere(feature) {
  const geo = feature.geometry && feature.geometry.type;
  if (!geo) return null;
  const p = feature.properties || {};
  const t = p.tags || p; // osmtogeojson legt die OSM-Merkmale je nach Einstellung direkt oder unter "tags" ab
  const flaeche = geo === "Polygon" || geo === "MultiPolygon";
  const linie = geo === "LineString" || geo === "MultiLineString";

  if (geo === "Point") return t.natural === "tree" ? { kat: "baum" } : null;

  if (flaeche && t.building && t.building !== "no") {
    return { kat: NEBENGEBAEUDE.has(t.building) ? "nebengebaeude" : "gebaeude" };
  }
  if (linie && t.highway && STRASSENTYP[t.highway] && !UNTERIRDISCH.has(t.tunnel)) {
    return { kat: "strasse", typ: STRASSENTYP[t.highway] };
  }
  if (flaeche && (t.natural === "water" || t.waterway === "riverbank" || t.waterway === "dock" || WASSER_LANDUSE.has(t.landuse))) {
    return { kat: "wasser" };
  }
  if (linie && WASSERLINIEN.has(t.waterway) && !UNTERIRDISCH.has(t.tunnel)) {
    return { kat: "wasserlinie", typ: t.waterway };
  }
  if (flaeche && (GRUEN_LEISURE.has(t.leisure) || GRUEN_LANDUSE.has(t.landuse) || GRUEN_NATURAL.has(t.natural))) {
    return { kat: "gruen" };
  }
  return null;
}

// ---------- 5. Pläne zeichnen ----------
const FARBE = {
  gebaeudeSchwarzplan: "#000000",
  gebaeudeLageplan: "#e6e1d9",   // helle Dachfläche; echte Dachformen folgen mit LoD2
  nebenLageplan: "#cfcfcf",
  umriss: "#222222",
  dachKante: "#4a4640",
  nebengebaeude: "#9a9a9a",
  kontext: "#ebebeb",
  gruen: "#cfe0c3",
  baum: "#7fa874",
  wasser: "#bcd5e6",
  strasseSchwarz: "#000000",
  strasseLageplan: "#555555"
};

// Meter auf der Karte in Pixel umrechnen, damit Straßen und Bäume beim Zoomen ihre echte Breite behalten.
// Bei Zoom 10 ist 1 m ca. 0,011 Pixel breit, bei Zoom 22 ca. 44,7 Pixel (auf Oldenburgs Breitengrad).
function inMetern(meter) {
  const mal = (faktor) => (typeof meter === "number" ? meter * faktor : ["*", meter, faktor]);
  return ["interpolate", ["exponential", 2], ["zoom"], 10, mal(0.0109), 22, mal(44.7)];
}
const STRASSENBREITE_M = ["match", ["get", "typ"], "haupt", 12, "sammel", 9, "wohn", 6, "service", 4, 2];
const WASSERLINIE_M = ["match", ["get", "typ"], "river", 8, "canal", 8, "stream", 2.5, 1.5];

const istKat = (...namen) => ["in", ["get", "kat"], ["literal", namen]];

// Gruppen von Ebenen, die ein Reiter ein- oder ausschaltet
const EBENEN = {
  kontext: ["kontext-gebaeude"],
  gruen: ["gruen-flaeche"],
  wasser: ["wasser-flaeche", "wasser-linie"],
  strassen: ["strassen-linie"],
  baeume: ["baeume"],
  gebaeude: ["gebaeude-flaeche"],
  umriss: ["gebaeude-umriss"],
  dach: ["dach-flaeche", "dach-umriss"],   // LoD2-Dachflächen (nur im Lageplan, nur wenn geladen)
  alkis: ["alkis-strasse", "alkis-weg", "alkis-platz", "alkis-kante"]   // amtliche Flächen (nur wenn geladen)
};

// Was zeigt welcher Reiter?
const ANSICHTEN = {
  karte:       { basiskarte: true,  ebenen: [] },
  schwarzplan: { basiskarte: false, ebenen: ["gebaeude"], gebaeude: FARBE.gebaeudeSchwarzplan,
                 text: "Schwarzplan: Gebäude schwarz, Nebengebäude grau." },
  strassen:    { basiskarte: false, ebenen: ["kontext", "strassen", "alkis"], strasse: FARBE.strasseSchwarz,
                 alkis: { strasse: "#3b3b3b", weg: "#c9c9c9", platz: "#e6e6e6", kante: "#111111" },
                 text: "Straßennetz: Linienstärke nach Straßenart." },
  gruen:       { basiskarte: false, ebenen: ["kontext", "gruen", "wasser", "baeume"],
                 text: "Grün und Wasser: Parks, Wiesen, Wald, Bäume, Gewässer." },
  lageplan:    { basiskarte: false, ebenen: ["gruen", "wasser", "strassen", "alkis", "baeume", "gebaeude", "umriss", "dach"],
                 alkis: { strasse: "#cfcfcf", weg: "#ebe7df", platz: "#f3f0ea", kante: "#8a8a8a" },
                 gebaeude: FARBE.gebaeudeLageplan, neben: FARBE.nebenLageplan, strasse: FARBE.strasseLageplan,
                 text: "Lageplan: alle Ebenen übereinander." }
};

let datenVorhanden = false;
let lod2Vorhanden = false;   // sind LoD2-Dachflächen geladen?
let osmFeatures = [];        // die einsortierten OSM-Objekte des aktuellen Gebiets
let lod2Quelle = "";         // Quellenvermerk für die geladenen LoD2-Daten
let alkisVorhanden = false;  // sind amtliche Straßenflächen geladen?
let alkisQuelle = "";        // Quellenvermerk dafür

function legePlanEbenenAn() {
  map.addSource("osm-daten", { type: "geojson", data: leer });
  map.addSource("maske", { type: "geojson", data: leer });
  const quelle = "osm-daten";
  const unsichtbar = { visibility: "none" };

  map.addLayer({ id: "kontext-gebaeude", type: "fill", source: quelle, layout: unsichtbar,
    filter: istKat("gebaeude", "nebengebaeude"), paint: { "fill-color": FARBE.kontext } });
  map.addLayer({ id: "gruen-flaeche", type: "fill", source: quelle, layout: unsichtbar,
    filter: istKat("gruen"), paint: { "fill-color": FARBE.gruen } });
  // Wasser liegt über dem Grün, sonst verschwinden Teiche in Parks
  map.addLayer({ id: "wasser-flaeche", type: "fill", source: quelle, layout: unsichtbar,
    filter: istKat("wasser"), paint: { "fill-color": FARBE.wasser } });
  map.addLayer({ id: "wasser-linie", type: "line", source: quelle, layout: unsichtbar,
    filter: istKat("wasserlinie"), paint: { "line-color": FARBE.wasser, "line-width": inMetern(WASSERLINIE_M) } });
  // Amtliche Straßen-, Weg- und Platzflächen (ALKIS). Reihenfolge: Straße unten, dann Weg (Gehweg), dann Platz.
  map.addSource("alkis-flaechen", { type: "geojson", data: leer });
  for (const art of ["strasse", "weg", "platz"]) {
    map.addLayer({ id: `alkis-${art}`, type: "fill", source: "alkis-flaechen", layout: unsichtbar,
      filter: ["==", ["get", "kat"], art], paint: { "fill-color": "#cccccc" } });
  }
  map.addLayer({ id: "alkis-kante", type: "line", source: "alkis-flaechen", layout: unsichtbar,
    paint: { "line-color": "#8a8a8a", "line-width": 0.4 } });
  map.addLayer({ id: "strassen-linie", type: "line", source: quelle,
    layout: { visibility: "none", "line-join": "round", "line-cap": "butt" },
    filter: istKat("strasse"), paint: { "line-color": FARBE.strasseSchwarz, "line-width": inMetern(STRASSENBREITE_M) } });
  map.addLayer({ id: "baeume", type: "circle", source: quelle, layout: unsichtbar,
    filter: istKat("baum"), paint: { "circle-color": FARBE.baum, "circle-opacity": 0.8, "circle-radius": inMetern(2.5) } });
  map.addLayer({ id: "gebaeude-flaeche", type: "fill", source: quelle, layout: unsichtbar,
    filter: istKat("gebaeude", "nebengebaeude"),
    paint: { "fill-color": ["match", ["get", "kat"], "nebengebaeude", FARBE.nebengebaeude, FARBE.gebaeudeSchwarzplan] } });
  // Feiner Umriss um die Gebäude (nur im Lageplan sichtbar)
  map.addLayer({ id: "gebaeude-umriss", type: "line", source: quelle, layout: unsichtbar,
    filter: istKat("gebaeude", "nebengebaeude"), paint: { "line-color": FARBE.umriss, "line-width": 0.8 } });
  // LoD2-Dachflächen: jede Dachfläche hat ihre eigene Farbe (nach Neigung und Himmelsrichtung schattiert)
  map.addSource("lod2-dach", { type: "geojson", data: leer });
  map.addLayer({ id: "dach-flaeche", type: "fill", source: "lod2-dach", layout: unsichtbar,
    paint: { "fill-color": ["get", "farbe"] } });
  map.addLayer({ id: "dach-umriss", type: "line", source: "lod2-dach", layout: unsichtbar,
    paint: { "line-color": FARBE.dachKante, "line-width": 0.5 } });
  // Die Maske deckt alles außerhalb des Rechtecks weiß ab, damit der Plan genau am Rand endet
  map.addLayer({ id: "maske", type: "fill", source: "maske", layout: unsichtbar,
    paint: { "fill-color": "#ffffff", "fill-opacity": 1 } });
}

// Weiße Fläche über die ganze Welt mit einem Loch in Form des Rechtecks
function maskeFuer(feature) {
  const loch = feature.geometry.coordinates[0].slice().reverse();
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: {
    type: "Polygon",
    coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], loch]
  } }] };
}

function verwerfeDaten() {
  ladeNummer++; // eine noch laufende Abfrage wird damit ungültig
  btnAnalyse.textContent = "Analysieren";
  datenVorhanden = false;
  stoppeLod2();
  lod2Vorhanden = false;
  lod2Quelle = "";
  lod2Mittelpunkte = [];
  alkisVorhanden = false;
  alkisQuelle = "";
  osmFeatures = [];
  if (kartenBereit) {
    map.getSource("osm-daten").setData(leer);
    map.getSource("lod2-dach").setData(leer);
    map.getSource("alkis-flaechen").setData(leer);
    map.getSource("maske").setData(leer);
  }
  zeigeFehler("");
  zeigeLod2Status("");
  zeigeAlkisStatus("");
}

// Stellt die Karte passend zum aktuellen Reiter ein
function wendeAnsichtAn() {
  if (!kartenBereit) return;
  const einstellung = ANSICHTEN[aktuelleAnsicht];
  if (!einstellung) return; // 3D oder Kennzahlen: die Karte ist nicht sichtbar
  const imPlan = aktuelleAnsicht !== "karte";
  const sichtbar = (an) => (an ? "visible" : "none");

  map.setLayoutProperty("osm", "visibility", sichtbar(einstellung.basiskarte));
  for (const [gruppe, ids] of Object.entries(EBENEN)) {
    let an = datenVorhanden && einstellung.ebenen.includes(gruppe);
    if (gruppe === "strassen" && alkisVorhanden) an = false; // wo amtliche Flächen da sind, brauchen wir die dünnen Linien nicht
    ids.forEach((id) => map.setLayoutProperty(id, "visibility", sichtbar(an)));
  }
  map.setLayoutProperty("maske", "visibility", sichtbar(imPlan && datenVorhanden));

  // Farben je nach Plan
  map.setPaintProperty("strassen-linie", "line-color", einstellung.strasse || FARBE.strasseSchwarz);
  map.setPaintProperty("gebaeude-flaeche", "fill-color",
    ["match", ["get", "kat"], "nebengebaeude", einstellung.neben || FARBE.nebengebaeude, einstellung.gebaeude || FARBE.gebaeudeSchwarzplan]);

  // Farben der amtlichen Straßenflächen je Plan
  if (einstellung.alkis) {
    map.setPaintProperty("alkis-strasse", "fill-color", einstellung.alkis.strasse);
    map.setPaintProperty("alkis-weg", "fill-color", einstellung.alkis.weg);
    map.setPaintProperty("alkis-platz", "fill-color", einstellung.alkis.platz);
    map.setPaintProperty("alkis-kante", "line-color", einstellung.alkis.kante);
  }

  // Im Lageplan zeichnen wir Gebäude, für die LoD2-Dächer da sind, nicht doppelt (als OSM-Fläche).
  // In den anderen Plänen bleiben alle OSM-Gebäude.
  const gebaeudeFilter = aktuelleAnsicht === "lageplan" && lod2Vorhanden
    ? ["all", istKat("gebaeude", "nebengebaeude"), ["==", ["coalesce", ["get", "lod2"], 0], 0]]
    : istKat("gebaeude", "nebengebaeude");
  map.setFilter("gebaeude-flaeche", gebaeudeFilter);
  map.setFilter("gebaeude-umriss", gebaeudeFilter);

  // Rechteck: auf der Karte rot gestrichelt, im Plan als feiner schwarzer Rahmen
  map.setPaintProperty("gebiet-flaeche", "fill-opacity", imPlan ? 0 : 0.08);
  map.setPaintProperty("gebiet-rand", "line-color", imPlan ? "#111111" : "#e2482d");
  map.setPaintProperty("gebiet-rand", "line-width", imPlan ? 1 : 2);
  map.setPaintProperty("gebiet-rand", "line-dasharray", imPlan ? [1, 0] : [3, 2]);

  // Hinweise über der Karte
  const hinweis = document.getElementById("plan-hint");
  if (imPlan && !datenVorhanden) {
    hinweis.textContent = gebiet
      ? "Noch keine Daten. Klicke links auf „Analysieren“."
      : "Noch kein Gebiet. Wähle im Reiter „Karte“ ein Rechteck und klicke dann auf „Analysieren“.";
  }
  hinweis.hidden = !(imPlan && !datenVorhanden);
  const quellen = document.getElementById("map-source");
  quellen.textContent = "Daten © OpenStreetMap-Mitwirkende (ODbL) · nicht vermessungsgenau" + (lod2Vorhanden ? " · " + lod2Quelle : "") + (alkisVorhanden ? " · " + alkisQuelle : "");
  quellen.hidden = !(imPlan && datenVorhanden);
}

// ---------- „Analysieren“ ----------
const analyseFehler = document.getElementById("analyse-fehler");
let ladeNummer = 0;

function zeigeFehler(text) {
  analyseFehler.textContent = text;
  analyseFehler.hidden = !text;
}

// Sobald irgendeine Datenquelle etwas geliefert hat, zeigen wir die Pläne (Maske, Ebenen).
// So erscheinen Straßen und Dächer schon nach wenigen Sekunden, auch wenn OpenStreetMap noch lädt.
function zeigePlaene(rahmen, bevorzugteAnsicht) {
  if (!datenVorhanden) {
    map.getSource("maske").setData(maskeFuer(rahmen));
    datenVorhanden = true;
  }
  if (aktuelleAnsicht === "karte") zeigeAnsicht(bevorzugteAnsicht);
  else wendeAnsichtAn();
}

btnAnalyse.addEventListener("click", async () => {
  if (!gebiet || turf.area(gebiet) > MAX_FLAECHE_M2) return;
  const meineNummer = ++ladeNummer;
  stoppeLod2(); // ein noch laufender LoD2-Abruf vom letzten Mal wird beendet
  const [west, sued, ost, nord] = turf.bbox(gebiet);
  const rahmen = gebiet;
  const aktuell = () => meineNummer === ladeNummer; // gilt diese Abfrage noch?

  zeigeFehler("");
  zeigeLod2Status("");
  zeigeAlkisStatus("");
  btnAnalyse.disabled = true;
  btnAnalyse.textContent = "Lädt …";
  analyseHint.textContent = "Daten werden geladen. OpenStreetMap kann bis zu einer Minute brauchen, die amtlichen Daten sind meist schneller.";

  // Amtliche Straßenflächen und LoD2-Dächer laden gleichzeitig mit OpenStreetMap.
  // Jede Quelle zeigt ihr Ergebnis, sobald sie fertig ist, ohne auf die anderen zu warten.
  starteAlkis(rahmen, meineNummer).then((ergebnis) => {
    if (!aktuell()) return;
    if (ergebnis.features) zeigePlaene(rahmen, "lageplan");
    wendeAlkisAn(ergebnis);
  });
  if (chkLod2.checked) {
    starteLod2(rahmen, meineNummer).then((ergebnis) => {
      if (!aktuell()) return;
      if (ergebnis.gebaeude && ergebnis.gebaeude.length) zeigePlaene(rahmen, "lageplan");
      wendeLod2An(ergebnis);
    });
  }

  try {
    const roh = await holeOsmDaten(sued, west, nord, ost);
    if (!aktuell()) return; // inzwischen anderes Gebiet gewählt oder gelöscht

    const umgewandelt = osmtogeojson(roh);
    const zaehler = { gebaeude: 0, nebengebaeude: 0, strasse: 0, gruen: 0, wasser: 0, wasserlinie: 0, baum: 0 };
    const features = [];
    for (const f of umgewandelt.features) {
      const k = kategorisiere(f);
      if (!k) continue;
      zaehler[k.kat]++;
      features.push({ type: "Feature", geometry: f.geometry, properties: k });
    }
    if (!features.length) {
      analyseHint.textContent = "Bereit. Klicke auf „Analysieren“.";
      zeigeFehler("In diesem Gebiet gibt es in OpenStreetMap keine passenden Daten.");
      return;
    }

    osmFeatures = features;
    markiereOsmGebaeude(lod2Mittelpunkte); // falls LoD2 schon da war
    map.getSource("osm-daten").setData({ type: "FeatureCollection", features });
    analyseHint.textContent =
      `OpenStreetMap geladen: ${zahl(zaehler.gebaeude + zaehler.nebengebaeude)} Gebäude (davon ${zahl(zaehler.nebengebaeude)} Nebengebäude), ` +
      `${zahl(zaehler.strasse)} Straßenabschnitte, ${zahl(zaehler.gruen)} Grünflächen, ` +
      `${zahl(zaehler.wasser + zaehler.wasserlinie)} Gewässer, ${zahl(zaehler.baum)} Einzelbäume. ` +
      "Zählung inklusive Objekten, die über den Rand hinausragen.";
    zeigePlaene(rahmen, "schwarzplan");
  } catch (fehler) {
    if (!aktuell()) return;
    analyseHint.textContent = datenVorhanden
      ? "OpenStreetMap fehlt (Schwarzplan, Grün und Bäume bleiben leer). Die amtlichen Daten sind geladen."
      : "Bereit. Klicke auf „Analysieren“.";
    zeigeFehler(fehler.message);
  } finally {
    if (aktuell()) {
      btnAnalyse.textContent = "Analysieren";
      btnAnalyse.disabled = !gebiet || turf.area(gebiet) > MAX_FLAECHE_M2;
    }
  }
});

// ---------- 6. LoD2: Dachformen der amtlichen 3D-Gebäudemodelle ----------
// Der LGLN (Landesvermessung Niedersachsen) stellt die Gebäude als 1-km-Kacheln frei zur Verfügung.
// Eine offizielle Suchschnittstelle (STAC) sagt uns, welche Kacheln unser Rechteck berühren.
const STAC_SUCHE = "https://lod.stac.lgln.niedersachsen.de/search";
const chkLod2 = document.getElementById("chk-lod2");
const lod2StatusFeld = document.getElementById("lod2-status");
let lod2Worker = null;

// UTM Zone 32 (ETRS89): das Koordinatensystem der amtlichen Daten, Einheit Meter
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");
const utmWandler = proj4("EPSG:4326", "EPSG:25832");

function zeigeLod2Status(text) {
  lod2StatusFeld.textContent = text;
  lod2StatusFeld.hidden = !text;
}

function stoppeLod2() {
  if (lod2Worker) { lod2Worker.terminate(); lod2Worker = null; }
}

async function sucheLod2Kacheln([west, sued, ost, nord]) {
  const bbox = [west, sued, ost, nord].map((z) => z.toFixed(6)).join(",");
  const antwort = await fetch(`${STAC_SUCHE}?collections=lod2&limit=20&bbox=${bbox}`);
  if (!antwort.ok) throw new Error(`Die Suche beim LGLN meldet Fehler ${antwort.status}`);
  const daten = await antwort.json();
  return (daten.features || [])
    .map((f) => ({
      id: f.id,
      url: f.assets && f.assets["lod2-gml"] && f.assets["lod2-gml"].href,
      jahr: ((f.properties && f.properties.datetime) || "").slice(0, 4)
    }))
    .filter((k) => k.url);
}

// Startet das Hintergrundprogramm und gibt die Gebäude zurück (Liste von Gebäuden mit Dachflächen)
function leseLod2(kacheln, utmBox, bericht) {
  return new Promise((fertig, fehler) => {
    const worker = new Worker("lod2-worker.js");
    lod2Worker = worker;
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.typ === "fortschritt") bericht(d);
      else if (d.typ === "fertig") { worker.terminate(); if (lod2Worker === worker) lod2Worker = null; fertig(d.gebaeude); }
      else if (d.typ === "fehler") { worker.terminate(); if (lod2Worker === worker) lod2Worker = null; fehler(new Error(d.text)); }
    };
    worker.onerror = (e) => { worker.terminate(); if (lod2Worker === worker) lod2Worker = null; fehler(new Error(e.message || "Hintergrundprogramm abgestürzt")); };
    worker.postMessage({ kacheln: kacheln.map(({ id, url }) => ({ id, url })), bbox: utmBox });
  });
}

// Sucht die Kacheln, lädt sie und liefert { gebaeude, jahr } oder { keine } oder { fehler }. Wirft nie.
async function starteLod2(rahmen, nummer) {
  try {
    zeigeLod2Status("LoD2: Suche passende Kacheln beim LGLN …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const kacheln = await sucheLod2Kacheln([west, sued, ost, nord]);
    if (nummer !== ladeNummer) return { abgebrochen: true };
    if (!kacheln.length) return { keine: true };

    const ecken = [[west, sued], [west, nord], [ost, sued], [ost, nord]].map((e) => utmWandler.forward(e));
    const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
    const utmBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

    const gebaeude = await leseLod2(kacheln, utmBox, (p) => {
      if (nummer !== ladeNummer) return;
      const prozent = p.gesamt ? Math.round((p.geladen / p.gesamt) * 100) : 0;
      zeigeLod2Status(`LoD2: ${prozent} % von ${p.kacheln} Kachel${p.kacheln > 1 ? "n" : ""} geladen (${zahl(p.geladen / 1e6, 0)} MB), ${zahl(p.gebaeude)} Gebäude im Gebiet gefunden …`);
    });
    const jahre = kacheln.map((k) => k.jahr).filter(Boolean).sort();
    return { gebaeude, jahr: jahre[jahre.length - 1] || "", kacheln: kacheln.length };
  } catch (fehler) {
    return { fehler: fehler.message };
  }
}

// ----- Dachflächen aufbereiten -----
// Wir beleuchten jede Dachfläche gedanklich von Nordwesten (wie bei Geländeschummerung in Karten):
// zur Sonne geneigte Flächen werden hell, abgewandte dunkel, Flachdächer liegen dazwischen.
const LICHT = [-0.5, 0.5, Math.SQRT1_2];
const DACH_DUNKEL = [143, 138, 130];
const DACH_HELL = [244, 241, 236];

// Senkrechte Richtung der Fläche (nach oben zeigend), aus den 3D-Eckpunkten [x, y, z, x, y, z, ...]
function flaechenNormale(ring) {
  let nx = 0, ny = 0, nz = 0;
  const n = ring.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ring[i * 3], y1 = ring[i * 3 + 1], z1 = ring[i * 3 + 2];
    const x2 = ring[j * 3], y2 = ring[j * 3 + 1], z2 = ring[j * 3 + 2];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  const laenge = Math.hypot(nx, ny, nz) || 1;
  const vorzeichen = nz < 0 ? -1 : 1;
  return [vorzeichen * nx / laenge, vorzeichen * ny / laenge, vorzeichen * nz / laenge];
}

function dachFarbe(normale) {
  const licht = normale[0] * LICHT[0] + normale[1] * LICHT[1] + normale[2] * LICHT[2];
  const t = Math.min(1, Math.max(0, (licht - 0.1) / 0.9));
  const kanal = (i) => Math.round(DACH_DUNKEL[i] + (DACH_HELL[i] - DACH_DUNKEL[i]) * t);
  return `rgb(${kanal(0)}, ${kanal(1)}, ${kanal(2)})`;
}

// Macht aus den UTM-Dachflächen Karten-Flächen (Längen-/Breitengrad) mit Farbe.
// Gibt außerdem je Fläche einen Mittelpunkt zurück, mit dem wir die passenden OSM-Gebäude finden.
function baueDachflaechen(gebaeudeListe) {
  const features = [];
  const mittelpunkte = [];
  for (const g of gebaeudeListe) {
    for (const ringe of g.flaechen) {
      const normale = flaechenNormale(ringe[0]);
      if (normale[2] < 0.05) continue; // fast senkrecht: von oben nicht zu sehen
      const koordinaten = ringe.map((ring) => {
        const punkte = [];
        for (let i = 0; i < ring.length; i += 3) punkte.push(utmWandler.inverse([ring[i], ring[i + 1]]));
        return punkte;
      });
      features.push({ type: "Feature", properties: { farbe: dachFarbe(normale) },
        geometry: { type: "Polygon", coordinates: koordinaten } });
      const aussen = koordinaten[0];
      const n = Math.max(1, aussen.length - 1); // letzter Punkt ist gleich dem ersten
      let lon = 0, lat = 0;
      for (let i = 0; i < n; i++) { lon += aussen[i][0]; lat += aussen[i][1]; }
      mittelpunkte.push([lon / n, lat / n]);
    }
  }
  return { features, mittelpunkte };
}

// Markiert OSM-Gebäude, auf denen mindestens eine LoD2-Dachfläche liegt, mit lod2 = 1.
// Wird aufgerufen, sobald beides da ist (egal, was zuerst fertig wurde).
let lod2Mittelpunkte = [];
function markiereOsmGebaeude(mittelpunkte) {
  if (!mittelpunkte.length || !osmFeatures.length) return 0;
  const gebaeude = osmFeatures
    .filter((f) => f.properties.kat === "gebaeude" || f.properties.kat === "nebengebaeude")
    .map((f) => ({ f, bb: turf.bbox(f) }));
  let markiert = 0;
  for (const [lon, lat] of mittelpunkte) {
    for (const g of gebaeude) {
      if (g.f.properties.lod2 === 1) continue;
      const [w, s, o, n] = g.bb;
      if (lon < w || lon > o || lat < s || lat > n) continue;
      if (turf.booleanPointInPolygon([lon, lat], g.f)) { g.f.properties.lod2 = 1; markiert++; }
    }
  }
  return markiert;
}

function wendeLod2An(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeLod2Status(`LoD2 konnte nicht geladen werden (${ergebnis.fehler}). Der Lageplan nutzt die OpenStreetMap-Gebäude.`);
    return;
  }
  if (ergebnis.keine) {
    zeigeLod2Status("LoD2: Für dieses Gebiet gibt es keine amtlichen Daten (nur Niedersachsen). Es bleibt bei OpenStreetMap.");
    return;
  }
  if (!ergebnis.gebaeude.length) {
    zeigeLod2Status("LoD2: Im Gebiet wurden keine Gebäude gefunden. Es bleibt bei OpenStreetMap.");
    return;
  }
  const { features, mittelpunkte } = baueDachflaechen(ergebnis.gebaeude);
  lod2Mittelpunkte = mittelpunkte;
  const ersetzt = markiereOsmGebaeude(mittelpunkte);
  map.getSource("lod2-dach").setData({ type: "FeatureCollection", features });
  if (osmFeatures.length) map.getSource("osm-daten").setData({ type: "FeatureCollection", features: osmFeatures });
  lod2Vorhanden = true;
  lod2Quelle = `LoD2: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert`;
  zeigeLod2Status(
    `LoD2 geladen: ${zahl(ergebnis.gebaeude.length)} Gebäude mit ${zahl(features.length)} Dachflächen` +
    (osmFeatures.length ? `, davon ersetzen ${zahl(ersetzt)} OSM-Gebäude im Lageplan` : "") +
    `. Quelle: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert.`);
  wendeAnsichtAn();
}

// ---------- 7. Amtliche Straßen-, Weg- und Platzflächen (ALKIS) ----------
// ALKIS ist das amtliche Liegenschaftskataster. Der LGLN stellt daraus frei Flächen bereit, die genau
// nachgezeichnet sind (nicht nur eine Linie je Straße). Wir fragen drei Flächenarten ab:
//   AX_Strassenverkehr = Straßenraum (Fahrbahn), AX_Weg = Wege (auch Gehwege), AX_Platz = Plätze.
// Der Dienst liefert GML (XML) in UTM-Koordinaten; wir wandeln es in Karten-Flächen um.
const ALKIS_WFS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_sf";
const ALKIS_ARTEN = { AX_Strassenverkehr: "strasse", AX_Weg: "weg", AX_Platz: "platz" };
const ALKIS_MAX = 3000;               // höchstens so viele Flächen je Art pro Abfrage
const alkisStatusFeld = document.getElementById("alkis-status");

function zeigeAlkisStatus(text) {
  alkisStatusFeld.textContent = text;
  alkisStatusFeld.hidden = !text;
}

// Liest die Flächen einer Art aus der GML-Antwort
function leseAlkisGml(text, art) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Antwort des LGLN nicht lesbar");
  const meldung = doc.getElementsByTagNameNS("*", "ExceptionText")[0];
  if (meldung) throw new Error("LGLN meldet: " + meldung.textContent.trim().slice(0, 120));

  const wurzel = doc.documentElement;
  const features = [];
  for (const objekt of doc.getElementsByTagNameNS("*", art)) {
    const fktElement = objekt.getElementsByTagNameNS("*", "funktion")[0];
    const funktion = fktElement ? fktElement.textContent.trim() : "";
    // Code 5130 ist im ATKIS-Katalog "Fußgängerzone" (für ALKIS nicht bestätigt): wir zeichnen sie wie einen Platz
    let kat = ALKIS_ARTEN[art];
    if (art === "AX_Strassenverkehr" && funktion === "5130") kat = "platz";

    for (const polygon of objekt.getElementsByTagNameNS("*", "Polygon")) {
      const ringe = [];
      const hinein = (element) => {
        const pos = element.getElementsByTagNameNS("*", "posList")[0];
        if (!pos) return;
        const z = pos.textContent.trim().split(/\s+/).map(Number);
        const ring = [];
        for (let i = 0; i + 1 < z.length; i += 2) ring.push(utmWandler.inverse([z[i], z[i + 1]]));
        if (ring.length >= 4) ringe.push(ring);
      };
      for (const e of polygon.getElementsByTagNameNS("*", "exterior")) hinein(e);
      for (const i of polygon.getElementsByTagNameNS("*", "interior")) hinein(i);
      if (ringe.length) features.push({ type: "Feature", properties: { kat, art: funktion },
        geometry: { type: "Polygon", coordinates: ringe } });
    }
  }
  return {
    features,
    stand: (wurzel.getAttribute("timeStamp") || "").slice(0, 4),
    abgeschnitten: Number(wurzel.getAttribute("numberReturned")) >= ALKIS_MAX
  };
}

// Fragt die drei Flächenarten gleichzeitig ab. Liefert { features, jahr, abgeschnitten } oder { fehler } oder { keine }.
async function starteAlkis(rahmen, nummer) {
  try {
    zeigeAlkisStatus("Amtliche Straßenflächen werden beim LGLN geladen …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const ecken = [[west, sued], [west, nord], [ost, sued], [ost, nord]].map((e) => utmWandler.forward(e));
    const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((z) => z.toFixed(1)).join(",");

    const teile = await Promise.all(Object.keys(ALKIS_ARTEN).map(async (art) => {
      const url = `${ALKIS_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:${art}` +
        `&SRSNAME=urn:ogc:def:crs:EPSG::25832&BBOX=${box},urn:ogc:def:crs:EPSG::25832&COUNT=${ALKIS_MAX}`;
      const antwort = await fetch(url);
      if (!antwort.ok) throw new Error(`Der LGLN-Dienst meldet Fehler ${antwort.status}`);
      return leseAlkisGml(await antwort.text(), art);
    }));
    if (nummer !== ladeNummer) return { abgebrochen: true };

    const features = teile.flatMap((t) => t.features);
    if (!features.length) return { keine: true };
    return { features, jahr: teile.map((t) => t.stand).find(Boolean) || "", abgeschnitten: teile.some((t) => t.abgeschnitten) };
  } catch (fehler) {
    return { fehler: fehler.message };
  }
}

function wendeAlkisAn(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeAlkisStatus(`Amtliche Straßenflächen konnten nicht geladen werden (${ergebnis.fehler}). Die Pläne zeigen die Straßenlinien aus OpenStreetMap.`);
    return;
  }
  if (ergebnis.keine) {
    zeigeAlkisStatus("Amtliche Straßenflächen: Für dieses Gebiet gibt es keine Daten (nur Niedersachsen). Es bleibt bei den Linien aus OpenStreetMap.");
    return;
  }
  map.getSource("alkis-flaechen").setData({ type: "FeatureCollection", features: ergebnis.features });
  alkisVorhanden = true;
  alkisQuelle = `Straßenflächen: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert`;
  const zaehler = { strasse: 0, weg: 0, platz: 0 };
  ergebnis.features.forEach((f) => zaehler[f.properties.kat]++);
  zeigeAlkisStatus(
    `Amtliche Straßenflächen geladen: ${zahl(zaehler.strasse)} Straßenflächen, ${zahl(zaehler.weg)} Wege, ${zahl(zaehler.platz)} Plätze` +
    (ergebnis.abgeschnitten ? " (Achtung: Obergrenze erreicht, nicht alle Flächen geladen)" : "") +
    `. Quelle: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert.`);
  wendeAnsichtAn();
}
