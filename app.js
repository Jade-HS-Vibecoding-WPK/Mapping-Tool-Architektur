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
  legeWirtEbenenAn();       // Reiter Wirtschaftlichkeit (wirtschaft.js)
  legeSchnittEbenenAn();    // Reiter Schnitt (schnitt.js): die gezogene Linie
  legeLuftbildEbenenAn();   // Reiter Luftbild (luftbild.js), liegt unter dem Rechteck
  legeInfoEbenenAn();       // Reiter Infos (infos.js)
  legeErreichEbenenAn();    // Gehzeit-Kreise im Reiter Umgebung (erreichbar.js)
  legeImportEbenenAn();     // importierte Dateien (import.js)
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
const KARTEN_REITER = ["karte", "schwarzplan", "strassen", "gruen", "lageplan", "flurstuecke", "mieten", "luftbild", "infos", "wirtschaft", "schnitt", "sonne"];
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
  if (ziel === "kennzahlen") aktualisiereKennzahlen();
  if (ziel === "3d") aktualisiere3D();
  aktualisiereExport();
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => zeigeAnsicht(tab.dataset.view));
});

// ---------- 4. Daten von OpenStreetMap laden ----------
// Overpass ist die kostenlose Abfrage-Schnittstelle von OpenStreetMap. Wir schicken ihr das Rechteck
// und bekommen alle Gebäude, Straßen, Grünflächen, Gewässer und Bäume darin zurück.
// Vier öffentliche Server, die wir gleichzeitig fragen. Der schnellste, der Daten liefert, gewinnt,
// die anderen Abfragen werden abgebrochen. So bremst ein langsamer oder ausgefallener Server nicht.
const OVERPASS_SERVER = [
  "https://overpass.openstreetmap.fr/api/interpreter",   // im Test deutlich schneller (ca. 4 s statt 40 bis 60 s)
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
  way["natural"="tree_row"](${b});
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
  const versuche = OVERPASS_SERVER.map((url) => {
    const host = new URL(url).host;
    ladeUnter("osm", host, host, "laedt", null, "fragt …");
    return frageServer(url, abfrage, stopp.signal)
      .then((daten) => { ladeUnter("osm", host, host, "fertig", 1, "Antwort erhalten"); return daten; })
      .catch((fehler) => {
        fehlerListe.push(fehler);
        if (stopp.signal.aborted) ladeUnter("osm", host, host, "abgebrochen", 1, "nicht mehr nötig");
        else { console.warn("Overpass-Abfrage fehlgeschlagen:", url, fehler); ladeUnter("osm", host, host, "fehler", 1, String(fehler.message).slice(0, 30)); }
        throw fehler;
      });
  });
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

  // Bäume: Höhe und Kronendurchmesser, wenn in OSM eingetragen (selten), sonst schätzen wir später
  const zahlOderNichts = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : undefined; };
  const baumMerkmale = () => ({
    hoehe: zahlOderNichts(t.height), krone: zahlOderNichts(t.diameter_crown),
    nadel: t.leaf_type === "needleleaved" ? 1 : 0, nr: String(feature.id || "")
  });
  if (geo === "Point") return t.natural === "tree" ? { kat: "baum", ...baumMerkmale() } : null;
  if (linie && t.natural === "tree_row") return { kat: "baumreihe", ...baumMerkmale() };

  if (flaeche && t.building && t.building !== "no") {
    const stockwerke = parseInt(t["building:levels"], 10);
    return {
      kat: NEBENGEBAEUDE.has(t.building) ? "nebengebaeude" : "gebaeude",
      bau: t.building,                                                        // OSM-Gebäudeart, z. B. "residential"
      ebenen: stockwerke >= 1 && stockwerke <= 60 ? stockwerke : undefined   // Geschosszahl, wenn in OSM eingetragen
    };
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
// Zentrale Farbpalette: Karte, Legende und 3D-Ansicht lesen alle von hier, damit sie zusammenpassen.
const FARBE = {
  // Gebäude
  gebaeudeSchwarzplan: "#000000",
  gebaeudeLageplan: "#ddd5c8",   // OSM-Gebäude ohne LoD2 im Lageplan (Dachfläche)
  nebenLageplan: "#bdb6aa",
  nebengebaeude: "#8c8c8c",      // Nebengebäude im Schwarzplan
  umriss: "#2b2823",
  dachKante: "#3a362f",
  dachDunkel: [72, 66, 60],       // LoD2-Dächer: von der Sonne abgewandt ...
  dachHell: [250, 247, 240],     // ... bis zur Sonne zugewandt
  kontext: "#e0e0e0",            // Gebäude als Orientierung in Straßennetz und Grün
  // Grün und Wasser
  gruen: "#bcd9a6",
  baum: "#6fa05a",
  krone: "#7fb06a",
  kroneNadel: "#4f8f74",
  kroneRand: "#3f6f38",
  stamm: "#3a3a2e",
  wasser: "#6aaedb",
  // Straßen: Linien und Flächen
  strasseSchwarz: "#000000",
  strasseLageplan: "#555555",
  netz: { fahrbahn: "#2e2e2e", weg: "#bdbdbd", platz: "#dedede", kante: "#111111" },        // Straßennetz (Schwarz-Weiß)
  plan: { fahrbahn: "#a4a9b0", weg: "#e2cfa6", platz: "#f3e9d0", kante: "#6e6a62" },        // Lageplan und 3D-Boden
  // Flurstücke: Farbläufe (hell, mittel, dunkel) je Einfärbung, grau = keine Angabe
  flst: {
    brw: ["#f7f0df", "#e6b56a", "#a8431f"],
    grz: ["#eef3f6", "#8fb3c9", "#2f5d7e"],
    gfz: ["#f1eef6", "#b8a3d0", "#5c3f87"],
    keine: "#e6e4df", gebaeude: "#4a4741", linie: "#4a4741", auswahl: "#e2482d"
  },
  // Mietpreise (Zensus-Raster): Farblauf hell, mittel, dunkel
  miet: { rampe: ["#cfeadb", "#73bda1", "#1b6a58"], keine: "#e6e4df", auswahl: "#e2482d", linie: "#5f8a7d" },
  // 3D-Modell
  d3: { hintergrund: "#f4f6f8", boden: "#f0eee8", wand: "#f2efe9", dach: "#8a8887", ersatzWand: "#cfdcea", ersatzDach: "#9db3cb", stamm: "#6b5a46" }
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
  gruen: ["gruen-flaeche", "alkis-gruen"],
  wasser: ["wasser-flaeche", "wasser-linie"],
  strassen: ["strassen-linie"],
  baeume: ["baum-krone", "baum-krone-rand", "baum-stamm"],
  gebaeude: ["gebaeude-flaeche"],
  umriss: ["gebaeude-umriss"],
  dach: ["dach-flaeche", "dach-umriss"],   // LoD2-Dachflächen (nur im Lageplan, nur wenn geladen)
  alkis: ["alkis-strasse", "alkis-weg", "alkis-platz", "alkis-kante"],   // amtliche Flächen (nur wenn geladen)
  flurstuecke: ["flst-flaeche", "flst-linie", "flst-auswahl"],           // Flurstücke (nur wenn geladen), siehe flurstuecke.js
  mieten: ["miet-flaeche", "miet-linie", "miet-auswahl"],                // Mietraster (nur wenn geladen), siehe mieten.js
  wirtschaft: ["wirt-flaeche", "wirt-linie", "wirt-auswahl"]             // Flurstücke mit Wirtschaftlichkeit, siehe wirtschaft.js
};

// Was zeigt welcher Reiter?
const ANSICHTEN = {
  karte:       { basiskarte: true,  ebenen: [] },
  schwarzplan: { basiskarte: false, ebenen: ["gebaeude"], gebaeude: FARBE.gebaeudeSchwarzplan,
                 text: "Schwarzplan: Gebäude schwarz, Nebengebäude grau." },
  strassen:    { basiskarte: false, ebenen: ["kontext", "strassen", "alkis"], strasse: FARBE.strasseSchwarz,
                 alkis: { strasse: FARBE.netz.fahrbahn, weg: FARBE.netz.weg, platz: FARBE.netz.platz, kante: FARBE.netz.kante },
                 text: "Straßennetz: Linienstärke nach Straßenart." },
  gruen:       { basiskarte: false, ebenen: ["kontext", "gruen", "wasser", "baeume"],
                 text: "Grün und Wasser: Parks, Wiesen, Wald, Bäume, Gewässer." },
  lageplan:    { basiskarte: false, ebenen: ["gruen", "wasser", "strassen", "alkis", "baeume", "gebaeude", "umriss", "dach"],
                 alkis: { strasse: FARBE.plan.fahrbahn, weg: FARBE.plan.weg, platz: FARBE.plan.platz, kante: FARBE.plan.kante },
                 gebaeude: FARBE.gebaeudeLageplan, neben: FARBE.nebenLageplan, strasse: FARBE.strasseLageplan,
                 text: "Lageplan: alle Ebenen übereinander." },
  flurstuecke: { basiskarte: false, ebenen: ["kontext", "flurstuecke"], kontextFarbe: FARBE.flst.gebaeude, kontextOpacity: 0.4,
                 text: "Flurstücke mit Bodenrichtwert und Bestand." },
  mieten:      { basiskarte: false, ebenen: ["kontext", "mieten"], kontextFarbe: FARBE.flst.gebaeude, kontextOpacity: 0.4,
                 text: "Mietpreise aus dem Zensus-Raster." },
  wirtschaft:  { basiskarte: false, ebenen: ["kontext", "wirtschaft"], kontextFarbe: FARBE.flst.gebaeude, kontextOpacity: 0.4,
                 text: "Flurstücke mit Steckbrief und Wirtschaftlichkeitsrechnung." },
  // Schnitt und Ansicht: Lageplan-Grundlage (Gebäude, LoD2-Dächer, Straßenflächen, Grün), darüber die gezogene Linie (siehe schnitt.js)
  schnitt:     { basiskarte: false, ebenen: ["gruen", "wasser", "strassen", "alkis", "gebaeude", "umriss", "dach"],
                 alkis: { strasse: FARBE.plan.fahrbahn, weg: FARBE.plan.weg, platz: FARBE.plan.platz, kante: FARBE.plan.kante },
                 gebaeude: FARBE.gebaeudeLageplan, neben: FARBE.nebenLageplan, strasse: FARBE.strasseLageplan,
                 text: "Linie ziehen, Schnitt und Straßenansicht." },
  // Sonne und Schatten: Lageplan-Grundlage, darüber das Bild aus Schatten oder Besonnungsdauer (siehe sonne.js)
  sonne:       { basiskarte: false, ebenen: ["gruen", "wasser", "strassen", "alkis", "baeume", "gebaeude", "umriss", "dach"],
                 alkis: { strasse: FARBE.plan.fahrbahn, weg: FARBE.plan.weg, platz: FARBE.plan.platz, kante: FARBE.plan.kante },
                 gebaeude: FARBE.gebaeudeLageplan, neben: FARBE.nebenLageplan, strasse: FARBE.strasseLageplan,
                 text: "Sonne und Schatten." },
  // Luftbild und Infos: Rechteck wie im Reiter "Karte" (rot gestrichelt), keine weiße Maske, Quellenangabe immer sichtbar
  luftbild:    { basiskarte: false, ebenen: [], rahmenWieKarte: true, rahmenFuellung: 0, quelleImmer: true,
                 text: "Luftbild des LGLN mit Überlagerungen." },
  infos:       { basiskarte: true, ebenen: [], rahmenWieKarte: true, quelleImmer: true,
                 text: "Orte aus OpenStreetMap, einzeln schaltbar." }
};

let datenVorhanden = false;
let lod2Vorhanden = false;   // sind LoD2-Dachflächen geladen?
let osmFeatures = [];        // die einsortierten OSM-Objekte des aktuellen Gebiets
let lod2Quelle = "";         // Quellenvermerk für die geladenen LoD2-Daten
let alkisVorhanden = false;  // sind amtliche Straßenflächen geladen?
let alkisFlaechen = [];      // die geladenen amtlichen Flächen (für die Kennzahlen)
let baumFeatures = [];       // Baumkronen (Flächen) und Stämme (Punkte) des aktuellen Gebiets
let alkisQuelle = "";        // Quellenvermerk dafür

function legePlanEbenenAn() {
  map.addSource("osm-daten", { type: "geojson", data: leer });
  map.addSource("maske", { type: "geojson", data: leer });
  const quelle = "osm-daten";
  const unsichtbar = { visibility: "none" };

  // Flurstücke: die Fläche liegt ganz unten (Gebäude darüber), Linien und Auswahl kommen weiter unten über die Gebäude
  map.addSource("flurstuecke", { type: "geojson", data: leer });
  map.addLayer({ id: "flst-flaeche", type: "fill", source: "flurstuecke", layout: unsichtbar,
    paint: { "fill-color": FARBE.flst.keine, "fill-opacity": 0.92 } });
  // Mietraster (Zensus 2022): ebenfalls unter den Gebäuden
  map.addSource("mieten", { type: "geojson", data: leer });
  map.addLayer({ id: "miet-flaeche", type: "fill", source: "mieten", layout: unsichtbar,
    paint: { "fill-color": FARBE.miet.keine, "fill-opacity": 0.92 } });
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
  map.addLayer({ id: "alkis-gruen", type: "fill", source: "alkis-flaechen", layout: unsichtbar,
    filter: ["in", ["get", "kat"], ["literal", ["gehoelz", "wald"]]], paint: { "fill-color": FARBE.gruen } });
  for (const art of ["strasse", "weg", "platz"]) {
    map.addLayer({ id: `alkis-${art}`, type: "fill", source: "alkis-flaechen", layout: unsichtbar,
      filter: ["==", ["get", "kat"], art], paint: { "fill-color": "#cccccc" } });
  }
  map.addLayer({ id: "alkis-kante", type: "line", source: "alkis-flaechen", layout: unsichtbar,
    filter: ["in", ["get", "kat"], ["literal", ["strasse", "weg", "platz"]]],
    paint: { "line-color": "#8a8a8a", "line-width": 0.4 } });
  map.addLayer({ id: "strassen-linie", type: "line", source: quelle,
    layout: { visibility: "none", "line-join": "round", "line-cap": "butt" },
    filter: istKat("strasse"), paint: { "line-color": FARBE.strasseSchwarz, "line-width": inMetern(STRASSENBREITE_M) } });
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
    paint: { "line-color": FARBE.dachKante, "line-width": 0.6 } });
  // Bäume: jede Krone ist eine eigene, leicht unregelmäßige Form in ihrer Größe, darüber ein Punkt für den Stamm.
  // Die Kronen liegen über den Dächern (wie im Lageplan üblich) und sind durchscheinend.
  map.addSource("baum-kronen", { type: "geojson", data: leer });
  map.addLayer({ id: "baum-krone", type: "fill", source: "baum-kronen", layout: unsichtbar,
    filter: ["==", ["get", "form"], "krone"],
    paint: { "fill-color": ["case", ["==", ["get", "nadel"], 1], FARBE.kroneNadel, FARBE.krone], "fill-opacity": 0.8 } });
  map.addLayer({ id: "baum-krone-rand", type: "line", source: "baum-kronen", layout: unsichtbar,
    filter: ["==", ["get", "form"], "krone"], paint: { "line-color": FARBE.kroneRand, "line-width": 0.7, "line-opacity": 0.9 } });
  map.addLayer({ id: "baum-stamm", type: "circle", source: "baum-kronen", layout: unsichtbar,
    filter: ["==", ["get", "form"], "stamm"], paint: { "circle-color": FARBE.stamm, "circle-radius": inMetern(0.35) } });
  // Flurstücksgrenzen und gewähltes Flurstück über den Gebäuden
  map.addLayer({ id: "flst-linie", type: "line", source: "flurstuecke", layout: unsichtbar,
    paint: { "line-color": FARBE.flst.linie, "line-width": 0.8 } });
  map.addLayer({ id: "flst-auswahl", type: "line", source: "flurstuecke", layout: { visibility: "none", "line-join": "round" },
    filter: ["==", ["get", "id"], -1], paint: { "line-color": FARBE.flst.auswahl, "line-width": 3 } });
  map.addLayer({ id: "miet-linie", type: "line", source: "mieten", layout: unsichtbar,
    paint: { "line-color": FARBE.miet.linie, "line-width": 0.7 } });
  map.addLayer({ id: "miet-auswahl", type: "line", source: "mieten", layout: { visibility: "none", "line-join": "round" },
    filter: ["==", ["get", "id"], -1], paint: { "line-color": FARBE.miet.auswahl, "line-width": 3 } });
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
  lod2Meta = [];
  lod2Gebaeude = [];
  lod2DachFeatures = [];
  kennzahlenLetzte = null;
  alkisFlaechen = [];
  baumFeatures = [];
  alkisVorhanden = false;
  alkisQuelle = "";
  gelaende = null;
  gelaendeQuelle = "";
  osmFeatures = [];
  verwerfeFlurstuecke();
  verwerfeMieten();
  verwerfeInfos();
  verwerfeWirtschaft();
  verwerfeSchnitt();
  verwerfeSonne();
  verwerfeHoehe();
  verwerfeErreich();
  verwerfeImport();
  if (kartenBereit) {
    map.getSource("osm-daten").setData(leer);
    map.getSource("lod2-dach").setData(leer);
    map.getSource("alkis-flaechen").setData(leer);
    map.getSource("baum-kronen").setData(leer);
    map.getSource("maske").setData(leer);
  }
  zeigeFehler("");
  zeigeLod2Status("");
  zeigeAlkisStatus("");
  zeigeGelaendeStatus("");
  if (typeof ladeLeeren === "function") ladeLeeren();
}

// Stellt die Karte passend zum aktuellen Reiter ein
function wendeAnsichtAn() {
  if (aktuelleAnsicht === "3d") { aktualisiere3D(); return; }   // 3D neu bauen, wenn neue Daten kamen
  if (aktuelleAnsicht === "kennzahlen") { aktualisiereKennzahlen(); return; }   // Kennzahlen neu rechnen, wenn neue Daten kamen
  if (!kartenBereit) return;
  const einstellung = ANSICHTEN[aktuelleAnsicht];
  if (!einstellung) return; // 3D oder Kennzahlen: die Karte ist nicht sichtbar
  const imPlan = aktuelleAnsicht !== "karte" && !einstellung.rahmenWieKarte;
  const sichtbar = (an) => (an ? "visible" : "none");

  map.setLayoutProperty("osm", "visibility", sichtbar(einstellung.basiskarte));
  for (const [gruppe, ids] of Object.entries(EBENEN)) {
    let an = datenVorhanden && einstellung.ebenen.includes(gruppe);
    if (gruppe === "strassen" && alkisVorhanden) an = false; // wo amtliche Flächen da sind, brauchen wir die dünnen Linien nicht
    if (gruppe === "flurstuecke" && !flurstueckeVorhanden) an = false;
    if (gruppe === "mieten" && !mietVorhanden) an = false;
    if (gruppe === "wirtschaft" && !flurstueckeVorhanden) an = false;
    ids.forEach((id) => map.setLayoutProperty(id, "visibility", sichtbar(an)));
  }
  map.setLayoutProperty("maske", "visibility", sichtbar(imPlan && datenVorhanden));

  // Farben je nach Plan
  map.setPaintProperty("kontext-gebaeude", "fill-color", einstellung.kontextFarbe || FARBE.kontext);
  map.setPaintProperty("kontext-gebaeude", "fill-opacity", einstellung.kontextOpacity || 1);
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
  const gebaeudeFilter = (aktuelleAnsicht === "lageplan" || aktuelleAnsicht === "schnitt" || aktuelleAnsicht === "sonne") && lod2Vorhanden
    ? ["all", istKat("gebaeude", "nebengebaeude"), ["==", ["coalesce", ["get", "lod2"], 0], 0]]
    : istKat("gebaeude", "nebengebaeude");
  map.setFilter("gebaeude-flaeche", gebaeudeFilter);
  map.setFilter("gebaeude-umriss", gebaeudeFilter);

  // Rechteck: auf der Karte rot gestrichelt, im Plan als feiner schwarzer Rahmen
  map.setPaintProperty("gebiet-flaeche", "fill-opacity", imPlan ? 0 : (einstellung.rahmenFuellung ?? 0.08));
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
  quellen.textContent = "Daten © OpenStreetMap-Mitwirkende (ODbL) · nicht vermessungsgenau" + (lod2Vorhanden ? " · " + lod2Quelle : "") + (alkisVorhanden ? " · " + alkisQuelle : "") +
    (aktuelleAnsicht === "flurstuecke" && flurstueckeVorhanden ? " · " + flurstueckeQuelle : "") +
    (aktuelleAnsicht === "mieten" && mietVorhanden ? " · " + mietQuelle : "") +
    (aktuelleAnsicht === "luftbild" ? ` · Luftbild: LGLN (${luftJahr}), CC BY 4.0` : "");
  quellen.hidden = !((imPlan && datenVorhanden) || einstellung.quelleImmer);
  aktualisiereFlurstuecke();   // rechnet und zeichnet nur im Reiter "Flurstücke"
  aktualisiereMieten();        // dito für "Mietpreise"
  aktualisiereSchnitt();       // Schnitt und Ansicht: Zeichnung und Linie
  aktualisiereWirtschaft();    // Wirtschaftlichkeit: Bestand rechnen, Karte, Panel
  aktualisiereLuftbild();      // Luftbild und seine Linien
  aktualisiereInfos();         // Infos: Schalter und Ebenen
  aktualisiereSonne();         // Sonne und Schatten: Bild und Panel
  aktualisiereHoehe();         // Schwarzplan: Schalter und Einfärbung nach Höhe
  aktualisiereErreich();       // Umgebung: Gehzeit-Kreise
  aktualisiereImport();        // importierte Dateien als Überlagerung
  aktualisiereExport();        // Knopf "Exportieren" nur in den Plan-Reitern
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
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
  zeigeGelaendeStatus("");
  zeigeFlstStatus("");
  zeigeMietStatus("");
  zeigeInfoStatus("");
  btnAnalyse.disabled = true;
  btnAnalyse.textContent = "Lädt …";
  analyseHint.textContent = "Daten werden geladen. OpenStreetMap kann bis zu einer Minute brauchen, die amtlichen Daten sind meist schneller.";
  ladeStart(chkLod2.checked);

  // Das Gelände (Höhenmodell) laden wir ebenfalls gleich mit; es wird nur für das 3D-Modell gebraucht.
  starteGelaende(rahmen, meineNummer).then((ergebnis) => {
    if (!aktuell()) return;
    wendeGelaendeAn(ergebnis);
  });
  // Flurstücke und Bodenrichtwerte (für den Reiter "Flurstücke") ebenfalls gleichzeitig
  starteFlurstuecke(rahmen, meineNummer).then((ergebnis) => {
    if (!aktuell()) return;
    if (ergebnis.flurstuecke) zeigePlaene(rahmen, "lageplan");
    wendeFlurstueckeAn(ergebnis);
  });
  // Mietraster (Zensus 2022) für den Reiter "Mietpreise"
  starteMieten(rahmen, meineNummer).then((ergebnis) => {
    if (!aktuell()) return;
    if (ergebnis.zellen) zeigePlaene(rahmen, "lageplan");
    wendeMietenAn(ergebnis);
  });
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
    const zaehler = { gebaeude: 0, nebengebaeude: 0, strasse: 0, gruen: 0, wasser: 0, wasserlinie: 0, baum: 0, baumreihe: 0 };
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
      ladeSetze("osm", "keine", 1, "keine Daten im Gebiet");
      return;
    }

    osmFeatures = features;
    setzeBaeume();
    markiereOsmGebaeude(lod2Mittelpunkte); // falls LoD2 schon da war
    map.getSource("osm-daten").setData({ type: "FeatureCollection", features });
    analyseHint.textContent =
      `OpenStreetMap geladen: ${zahl(zaehler.gebaeude + zaehler.nebengebaeude)} Gebäude (davon ${zahl(zaehler.nebengebaeude)} Nebengebäude), ` +
      `${zahl(zaehler.strasse)} Straßenabschnitte, ${zahl(zaehler.gruen)} Grünflächen, ` +
      `${zahl(zaehler.wasser + zaehler.wasserlinie)} Gewässer, ${zahl(zaehler.baum)} Einzelbäume. ` +
      "Zählung inklusive Objekten, die über den Rand hinausragen.";
    ladeSetze("osm", "fertig", 1, `${zahl(features.length)} Objekte`);
    zeigePlaene(rahmen, "schwarzplan");
  } catch (fehler) {
    if (!aktuell()) return;
    analyseHint.textContent = datenVorhanden
      ? "OpenStreetMap fehlt (Schwarzplan, Grün und Bäume bleiben leer). Die amtlichen Daten sind geladen."
      : "Bereit. Klicke auf „Analysieren“.";
    zeigeFehler(fehler.message);
    ladeSetze("osm", "fehler", 1, "nicht erreichbar, bitte nochmal „Analysieren“ drücken");
  } finally {
    if (aktuell()) {
      btnAnalyse.textContent = "Analysieren";
      btnAnalyse.disabled = !gebiet || turf.area(gebiet) > MAX_FLAECHE_M2;
      // Die Orte für den Reiter "Infos" kommen erst jetzt, damit sie die Hauptabfrage nicht ausbremsen
      starteInfos(rahmen, meineNummer).then((ergebnis) => { if (aktuell()) wendeInfosAn(ergebnis); });
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
  // Bis zu drei Versuche: eine kurze Störung soll nicht gleich bedeuten, dass LoD2 fehlt
  let daten = null, letzterFehler = null;
  for (let versuch = 1; versuch <= 3 && !daten; versuch++) {
    try {
      const antwort = await fetch(`${STAC_SUCHE}?collections=lod2&limit=20&bbox=${bbox}`);
      if (!antwort.ok) throw new Error(`Die Suche beim LGLN meldet Fehler ${antwort.status}`);
      daten = await antwort.json();
    } catch (fehler) {
      letzterFehler = fehler;
      await new Promise((ok) => setTimeout(ok, 1000 * versuch));
    }
  }
  if (!daten) throw letzterFehler;
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
      else if (d.typ === "hinweis") bericht({ hinweis: d.text });
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
    ladeSetze("lod2", "laedt", null, "Kacheln werden gesucht …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const kacheln = await sucheLod2Kacheln([west, sued, ost, nord]);
    if (nummer !== ladeNummer) return { abgebrochen: true };
    if (!kacheln.length) return { keine: true };
    kacheln.forEach((k) => ladeUnter("lod2", k.id, kachelName(k.id), "laedt", null, "wartet …"));

    const ecken = [[west, sued], [west, nord], [ost, sued], [ost, nord]].map((e) => utmWandler.forward(e));
    const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
    const utmBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

    const gebaeude = await leseLod2(kacheln, utmBox, (p) => {
      if (nummer !== ladeNummer) return;
      if (p.hinweis) {   // z. B. "Verbindung hing, neuer Versuch"
        zeigeLod2Status("LoD2: " + p.hinweis);
        ladeSetze("lod2", "laedt", null, p.hinweis);
        return;
      }
      // Noch nicht alle Kacheln haben ihre Größe gemeldet: für die fehlenden rechnen wir mit ca. 55 MB
      const gesamtSchaetzung = p.gesamt + Math.max(0, p.kacheln - p.gemeldet) * 55e6;
      const anteil = gesamtSchaetzung ? Math.min(0.99, p.geladen / gesamtSchaetzung) : 0;
      zeigeLod2Status(`LoD2: ${Math.round(anteil * 100)} % von ${p.kacheln} Kachel${p.kacheln > 1 ? "n" : ""} geladen (${zahl(p.geladen / 1e6, 0)} MB), ${zahl(p.gebaeude)} Gebäude im Gebiet gefunden …`);
      ladeSetze("lod2", "laedt", anteil, `${Math.round(anteil * 100)} % · ${zahl(p.geladen / 1e6, 0)} MB · ${zahl(p.gebaeude)} Gebäude gefunden`);
      // Stand je Kachel
      (p.kachelStand || []).forEach((s) => {
        const fertig = s.gesamt > 0 && s.geladen >= s.gesamt;
        ladeUnter("lod2", s.id, kachelName(s.id), fertig ? "fertig" : "laedt", fertig ? 1 : (s.gesamt ? s.geladen / s.gesamt : null),
          s.gesamt ? `${zahl(s.geladen / 1e6, 0)} / ${zahl(s.gesamt / 1e6, 0)} MB` : "neuer Versuch …");
      });
    });
    kacheln.forEach((k) => ladeUnter("lod2", k.id, kachelName(k.id), "fertig", 1, "gelesen"));
    const jahre = kacheln.map((k) => k.jahr).filter(Boolean).sort();
    return { gebaeude, jahr: jahre[jahre.length - 1] || "", kacheln: kacheln.length };
  } catch (fehler) {
    // Kacheln, die nicht fertig wurden, als fehlgeschlagen zeigen
    const unter = ladeZustand.lod2 && ladeZustand.lod2.unter;
    if (unter) unter.forEach((u, id) => { if (u.z === "laedt") ladeUnter("lod2", id, u.label, "fehler", 1, "nicht geladen"); });
    return { fehler: fehler.message };
  }
}

// Nur LoD2 noch einmal laden (z. B. nach einem Verbindungsfehler), ohne OpenStreetMap neu zu fragen
async function wiederholeLod2() {
  if (!gebiet) return;
  const nummer = ladeNummer;
  const rahmen = gebiet;
  stoppeLod2();
  zeigeLod2Status("");
  ladeSetze("lod2", "laedt", null, "neuer Versuch …");
  const ergebnis = await starteLod2(rahmen, nummer);
  if (nummer !== ladeNummer) return;
  if (ergebnis.gebaeude && ergebnis.gebaeude.length) zeigePlaene(rahmen, "lageplan");
  wendeLod2An(ergebnis);
}

// ----- Dachflächen aufbereiten -----
// Wir beleuchten jede Dachfläche gedanklich von Nordwesten (wie bei Geländeschummerung in Karten):
// zur Sonne geneigte Flächen werden hell, abgewandte dunkel, Flachdächer liegen dazwischen.
const LICHT = [-0.5, 0.5, Math.SQRT1_2];
const DACH_DUNKEL = FARBE.dachDunkel;
const DACH_HELL = FARBE.dachHell;

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
  const t = Math.min(1, Math.max(0, (licht - 0.2) / 0.7));   // engerer Bereich = mehr Kontrast zwischen den Dachseiten
  const kanal = (i) => Math.round(DACH_DUNKEL[i] + (DACH_HELL[i] - DACH_DUNKEL[i]) * t);
  return `rgb(${kanal(0)}, ${kanal(1)}, ${kanal(2)})`;
}

// Macht aus den UTM-Dachflächen Karten-Flächen (Längen-/Breitengrad) mit Farbe.
// Gibt außerdem je Fläche einen Mittelpunkt zurück, mit dem wir die passenden OSM-Gebäude finden.
function baueDachflaechen(gebaeudeListe) {
  const features = [];
  const mittelpunkte = [];   // je Dachfläche: [Länge, Breite, Nummer des Gebäudes]
  const meta = [];           // je Gebäude: Merkmale und ein Punkt auf dem Gebäude (für die Kennzahlen)
  gebaeudeListe.forEach((g, nummer) => {
    meta[nummer] = { funktion: g.funktion, dachtyp: g.dachtyp, hoehe: g.hoehe, trauf: g.trauf, boden: g.boden, punkt: null };
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
      mittelpunkte.push([lon / n, lat / n, nummer]);
      if (!meta[nummer].punkt) meta[nummer].punkt = [lon / n, lat / n];
    }
  });
  return { features, mittelpunkte, meta };
}

// Markiert OSM-Gebäude, auf denen mindestens eine LoD2-Dachfläche liegt, mit lod2 = 1.
// Wird aufgerufen, sobald beides da ist (egal, was zuerst fertig wurde).
let lod2Mittelpunkte = [];
let lod2Meta = [];   // Merkmale der LoD2-Gebäude (Nutzung, Dachform, Höhen) für die Kennzahlen
let lod2DachFeatures = [];  // die Dachflächen als GeoJSON (für den Export)
let lod2Gebaeude = [];   // die LoD2-Gebäude mit allen Dach- und Wandflächen (für die 3D-Ansicht)
function markiereOsmGebaeude(mittelpunkte) {
  if (!mittelpunkte.length || !osmFeatures.length) return 0;
  const gebaeude = osmFeatures
    .filter((f) => f.properties.kat === "gebaeude" || f.properties.kat === "nebengebaeude")
    .map((f) => ({ f, bb: turf.bbox(f) }));
  let markiert = 0;
  for (const [lon, lat, nummer] of mittelpunkte) {
    for (const g of gebaeude) {
      if (g.f.properties.lod2 === 1) continue;
      const [w, s, o, n] = g.bb;
      if (lon < w || lon > o || lat < s || lat > n) continue;
      if (turf.booleanPointInPolygon([lon, lat], g.f)) {
        const m = lod2Meta[nummer] || {};
        Object.assign(g.f.properties, { lod2: 1, funktion: m.funktion, dachtyp: m.dachtyp, hoehe: m.hoehe, trauf: m.trauf, boden: m.boden });
        // Laut amtlichem Code (51009_…) ist es ein Nebengebäude oder eine Überdachung, auch wenn OSM es als normales Gebäude führt
        if (m.funktion && m.funktion.startsWith("51009")) g.f.properties.kat = "nebengebaeude";
        markiert++;
      }
    }
  }
  return markiert;
}

function wendeLod2An(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeLod2Status(`LoD2 konnte nicht geladen werden (${ergebnis.fehler}). Der Lageplan nutzt die OpenStreetMap-Gebäude.`);
    ladeSetze("lod2", "fehler", 1, "nicht geladen, Lageplan nutzt OpenStreetMap");
    return;
  }
  if (ergebnis.keine) {
    zeigeLod2Status("LoD2: Für dieses Gebiet gibt es keine amtlichen Daten (nur Niedersachsen). Es bleibt bei OpenStreetMap.");
    ladeSetze("lod2", "keine", 1, "keine Daten (nur Niedersachsen)");
    return;
  }
  if (!ergebnis.gebaeude.length) {
    zeigeLod2Status("LoD2: Im Gebiet wurden keine Gebäude gefunden. Es bleibt bei OpenStreetMap.");
    ladeSetze("lod2", "keine", 1, "keine Gebäude im Gebiet");
    return;
  }
  const { features, mittelpunkte, meta } = baueDachflaechen(ergebnis.gebaeude);
  lod2Mittelpunkte = mittelpunkte;
  lod2Meta = meta;
  lod2Gebaeude = ergebnis.gebaeude;
  lod2DachFeatures = features;
  const ersetzt = markiereOsmGebaeude(mittelpunkte);
  map.getSource("lod2-dach").setData({ type: "FeatureCollection", features });
  if (osmFeatures.length) map.getSource("osm-daten").setData({ type: "FeatureCollection", features: osmFeatures });
  lod2Vorhanden = true;
  lod2Quelle = `LoD2: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert`;
  ladeSetze("lod2", "fertig", 1, `${zahl(ergebnis.gebaeude.length)} Gebäude`);
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
const ALKIS_ARTEN = { AX_Strassenverkehr: "strasse", AX_Weg: "weg", AX_Platz: "platz", AX_Gehoelz: "gehoelz", AX_Wald: "wald" };
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
    ladeSetze("alkis", "laedt", null, "wird abgefragt …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const ecken = [[west, sued], [west, nord], [ost, sued], [ost, nord]].map((e) => utmWandler.forward(e));
    const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((z) => z.toFixed(1)).join(",");

    const alkisNamen = { AX_Strassenverkehr: "Straßenraum", AX_Weg: "Wege und Gehwege", AX_Platz: "Plätze", AX_Gehoelz: "Gehölz", AX_Wald: "Wald" };
    const teile = await Promise.all(Object.keys(ALKIS_ARTEN).map(async (art) => {
      ladeUnter("alkis", art, alkisNamen[art], "laedt", null, "");
      const url = `${ALKIS_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=adv:${art}` +
        `&SRSNAME=urn:ogc:def:crs:EPSG::25832&BBOX=${box},urn:ogc:def:crs:EPSG::25832&COUNT=${ALKIS_MAX}`;
      try {
        const antwort = await fetch(url);
        if (!antwort.ok) throw new Error(`Der LGLN-Dienst meldet Fehler ${antwort.status}`);
        const teil = leseAlkisGml(await antwort.text(), art);
        ladeUnter("alkis", art, alkisNamen[art], "fertig", 1, `${zahl(teil.features.length)} Flächen`);
        return teil;
      } catch (fehler) {
        ladeUnter("alkis", art, alkisNamen[art], "fehler", 1, "Fehler");
        throw fehler;
      }
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
    ladeSetze("alkis", "fehler", 1, "nicht geladen, Pläne nutzen OpenStreetMap-Linien");
    return;
  }
  if (ergebnis.keine) {
    zeigeAlkisStatus("Amtliche Straßenflächen: Für dieses Gebiet gibt es keine Daten (nur Niedersachsen). Es bleibt bei den Linien aus OpenStreetMap.");
    ladeSetze("alkis", "keine", 1, "keine Daten (nur Niedersachsen)");
    return;
  }
  map.getSource("alkis-flaechen").setData({ type: "FeatureCollection", features: ergebnis.features });
  alkisFlaechen = ergebnis.features;
  ladeSetze("alkis", "fertig", 1, `${zahl(ergebnis.features.length)} Flächen`);
  alkisVorhanden = true;
  alkisQuelle = `Straßenflächen: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert`;
  const zaehler = { strasse: 0, weg: 0, platz: 0, gehoelz: 0, wald: 0 };
  ergebnis.features.forEach((f) => zaehler[f.properties.kat]++);
  zeigeAlkisStatus(
    `Amtliche Straßenflächen geladen: ${zahl(zaehler.strasse)} Straßenflächen, ${zahl(zaehler.weg)} Wege, ${zahl(zaehler.platz)} Plätze, ${zahl(zaehler.gehoelz + zaehler.wald)} Gehölz- und Waldflächen` +
    (ergebnis.abgeschnitten ? " (Achtung: Obergrenze erreicht, nicht alle Flächen geladen)" : "") +
    `. Quelle: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert.`);
  wendeAnsichtAn();
}

// ---------- 8. Kennzahlen ----------
// Alle Zahlen gelten für das gewählte Rechteck. Objekte am Rand werden abgeschnitten (Flächen, Längen)
// oder nach ihrem Mittelpunkt gezählt (Anzahlen). Überlappende Flächen zählen wir nicht doppelt:
// dafür "malen" wir sie unsichtbar in ein Raster (1 Pixel = ca. 1 m) und zählen die Pixel.
const kzFeld = document.getElementById("kz-inhalt");
const GESCHOSSHOEHE_M = 3;     // Annahme: ein Geschoss ist ca. 3 m hoch
const GESCHOSSE_ERSATZ = 3;    // Ersatzwert, wenn weder OSM noch LoD2 eine Geschosszahl liefern
const STRASSENBREITE_SCHAETZUNG = { haupt: 12, sammel: 9, wohn: 6, service: 4, fuss: 2 };   // Meter
const STRASSENARTEN = { haupt: "Hauptstraßen", sammel: "Sammelstraßen", wohn: "Wohn- und Erschließungsstraßen", service: "Zufahrten", fuss: "Fuß-, Rad- und Waldwege" };
const WASSER_BREITE_SCHAETZUNG = { river: 8, canal: 8, stream: 2.5, ditch: 1.5, drain: 1.5 };

// Dachformen laut Schlüssel der amtlichen LoD2-Daten (AdV-Standard). Nicht gegen den Katalog geprüft.
const DACHFORMEN = {
  1000: "Flachdach", 2100: "Pultdach", 2200: "Versetztes Pultdach", 3100: "Satteldach", 3200: "Walmdach",
  3300: "Krüppelwalmdach", 3400: "Mansarddach", 3500: "Zeltdach", 3600: "Kegeldach", 3700: "Kuppeldach",
  3800: "Sheddach", 3900: "Bogendach", 4000: "Turmdach", 5000: "Mischform", 9999: "Sonstige"
};

// Nutzung grob aus dem amtlichen Gebäudecode (z. B. 31001_1000): erste Ziffer nach dem Unterstrich.
// Das ist eine grobe Zuordnung, nicht gegen die offizielle Codeliste geprüft.
function nutzungAusCode(code) {
  if (!code) return null;
  if (code.startsWith("51009")) return "Nebengebäude, Überdachung";
  const ziffer = (code.split("_")[1] || "")[0];
  if (ziffer === "1") return "Wohnen";
  if (ziffer === "2") return "Gewerbe, Handel, Dienstleistung";
  if (ziffer === "3") return "Öffentliche Zwecke";
  return "Sonstige";
}
const OSM_WOHNEN = new Set(["residential", "house", "apartments", "detached", "semidetached_house", "terrace", "dormitory", "bungalow", "farm"]);
const OSM_GEWERBE = new Set(["commercial", "retail", "office", "industrial", "warehouse", "hotel", "supermarket", "kiosk", "manufacture"]);
const OSM_OEFFENTLICH = new Set(["public", "school", "university", "college", "hospital", "church", "cathedral", "chapel", "civic", "government", "kindergarten", "train_station", "theatre", "museum", "fire_station"]);
function nutzungAusOsm(bau) {
  if (OSM_WOHNEN.has(bau)) return "Wohnen";
  if (OSM_GEWERBE.has(bau)) return "Gewerbe, Handel, Dienstleistung";
  if (OSM_OEFFENTLICH.has(bau)) return "Öffentliche Zwecke";
  if (!bau || bau === "yes") return "Unbekannt";
  return "Sonstige";
}

// Geschosse eines Gebäudes: 1. aus OSM, 2. aus der LoD2-Traufhöhe, 3. Ersatzwert
function geschosseVon(p) {
  if (p.ebenen) return { n: p.ebenen, quelle: "osm" };
  let hoehe = null;
  if (p.trauf != null && p.boden != null) hoehe = p.trauf - p.boden;   // Traufhöhe über Gelände
  if (!(hoehe > 0) && p.hoehe > 0) hoehe = p.hoehe;                     // sonst Gebäudehöhe
  if (hoehe > 0) return { n: Math.max(1, Math.round(hoehe / GESCHOSSHOEHE_M)), quelle: "lod2" };
  return { n: GESCHOSSE_ERSATZ, quelle: "ersatz" };
}

// ----- Raster-Helfer -----
function zeichneFlaeche(ctx, pt, geom) {
  const polygone = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  for (const polygon of polygone) {
    ctx.beginPath();
    for (const ring of polygon) ring.forEach((p, i) => { const [x, y] = pt(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.fill("evenodd");   // Löcher (Innenhöfe) bleiben frei
  }
}
function zeichneLinie(ctx, pt, geom) {
  const linien = geom.type === "LineString" ? [geom.coordinates] : geom.type === "MultiLineString" ? geom.coordinates : [];
  for (const linie of linien) {
    ctx.beginPath();
    linie.forEach((p, i) => { const [x, y] = pt(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
}
// Zeichnet etwas in ein unsichtbares Bild und gibt zurück, welche Pixel bedeckt sind (1) oder frei (0)
function malRaster(bbox, w, h, zeichner) {
  const [west, sued, ost, nord] = bbox;
  const leinwand = document.createElement("canvas");
  leinwand.width = w; leinwand.height = h;
  const ctx = leinwand.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000"; ctx.strokeStyle = "#000"; ctx.lineJoin = "round"; ctx.lineCap = "butt";
  zeichner(ctx, ([lon, lat]) => [((lon - west) / (ost - west)) * w, ((nord - lat) / (nord - sued)) * h]);
  const pixel = ctx.getImageData(0, 0, w, h).data;
  const maske = new Uint8Array(w * h);
  for (let i = 0; i < maske.length; i++) maske[i] = pixel[i * 4 + 3] > 127 ? 1 : 0;
  return maske;
}
const zaehlePixel = (m) => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n; };
function vereine(masken) {
  const aus = new Uint8Array(masken[0].length);
  for (const m of masken) for (let i = 0; i < aus.length; i++) if (m[i]) aus[i] = 1;
  return aus;
}
function flaecheImRechteck(f, bbox) {
  try {
    const c = turf.bboxClip(f, bbox);
    return c.geometry.coordinates.length ? turf.area(c) : 0;
  } catch (_) { return 0; }
}
function laengeImRechteck(f, bbox) {
  try {
    const c = turf.bboxClip(f, bbox);
    return c.geometry.coordinates.length ? turf.length(c, { units: "meters" }) : 0;
  } catch (_) { return 0; }
}

// ----- Berechnung -----
function berechneKennzahlen() {
  const bbox = turf.bbox(gebiet);
  const [west, sued, ost, nord] = bbox;
  const flaeche = turf.area(gebiet);
  const breiteM = turf.distance([west, sued], [ost, sued], { units: "meters" });
  const hoeheM = turf.distance([west, sued], [west, nord], { units: "meters" });
  const w = Math.min(1500, Math.max(50, Math.round(breiteM)));
  const h = Math.min(1500, Math.max(50, Math.round(hoeheM)));
  const pxProM = w / breiteM;
  const m2JePixel = flaeche / (w * h);
  const hatOsm = osmFeatures.length > 0;
  const hinweise = [];
  const imRahmen = (f) => {
    const b = turf.bbox(f);
    const x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
    return x >= west && x <= ost && y >= sued && y <= nord;
  };
  const osm = (kat) => osmFeatures.filter((f) => f.properties.kat === kat);

  const k = { flaeche, breiteM, hoeheM, hatOsm, hatAlkis: alkisVorhanden, hatLod2: lod2Vorhanden };

  // Gebäude (aus OSM; Grundfläche am Rechteck abgeschnitten)
  if (hatOsm) {
    const haupt = osm("gebaeude").filter(imRahmen);
    const neben = osm("nebengebaeude").filter(imRahmen);
    k.anzahlHaupt = haupt.length;
    k.anzahlNeben = neben.length;
    k.nebenFlaeche = neben.reduce((s, f) => s + flaecheImRechteck(f, bbox), 0);
    k.gebaeude = haupt.map((f) => ({ f, flaeche: flaecheImRechteck(f, bbox), geschosse: geschosseVon(f.properties) }));
    k.grundflaeche = k.gebaeude.reduce((s, g) => s + g.flaeche, 0);
    k.geschossflaeche = k.gebaeude.reduce((s, g) => s + g.flaeche * g.geschosse.n, 0);
    k.mittlereGeschosse = k.gebaeude.length ? k.gebaeude.reduce((s, g) => s + g.geschosse.n, 0) / k.gebaeude.length : 0;
    k.geschosseQuellen = { osm: 0, lod2: 0, ersatz: 0 };
    k.gebaeude.forEach((g) => k.geschosseQuellen[g.geschosse.quelle]++);
  }

  // Verkehrsflächen: amtliche Flächen, sonst Straßenlinien mal geschätzte Breite
  let verkehr = null;
  if (alkisVorhanden) {
    const verkehrsFlaechen = alkisFlaechen.filter((f) => ["strasse", "weg", "platz"].includes(f.properties.kat));
    verkehr = malRaster(bbox, w, h, (ctx, pt) => verkehrsFlaechen.forEach((f) => zeichneFlaeche(ctx, pt, f.geometry)));
    k.alkisTeile = { strasse: 0, weg: 0, platz: 0 };
    verkehrsFlaechen.forEach((f) => { k.alkisTeile[f.properties.kat] += flaecheImRechteck(f, bbox); });
  } else if (hatOsm) {
    verkehr = malRaster(bbox, w, h, (ctx, pt) => osm("strasse").forEach((f) => {
      ctx.lineWidth = (STRASSENBREITE_SCHAETZUNG[f.properties.typ] || 4) * pxProM;
      zeichneLinie(ctx, pt, f.geometry);
    }));
    k.verkehrGeschaetzt = true;
    hinweise.push("Verkehrsflächen sind geschätzt (Straßenlinien aus OpenStreetMap mal angenommene Breite), weil keine amtlichen Flächen geladen sind.");
  }
  k.verkehrFlaeche = verkehr ? zaehlePixel(verkehr) * m2JePixel : null;

  // Straßenlänge aus OSM-Linien
  if (hatOsm) {
    k.laenge = {};
    osm("strasse").forEach((f) => { k.laenge[f.properties.typ] = (k.laenge[f.properties.typ] || 0) + laengeImRechteck(f, bbox); });
    k.laengeGesamt = Object.values(k.laenge).reduce((s, v) => s + v, 0);
  }

  // Grün und Wasser (aus OSM)
  let gruen = null, wasser = null;
  if (hatOsm) {
    // Grün: OSM-Flächen plus amtliche Gehölz- und Waldflächen
    const amtlichGruen = alkisFlaechen.filter((f) => f.properties.kat === "gehoelz" || f.properties.kat === "wald");
    gruen = malRaster(bbox, w, h, (ctx, pt) => { osm("gruen").concat(amtlichGruen).forEach((f) => zeichneFlaeche(ctx, pt, f.geometry)); });
    wasser = malRaster(bbox, w, h, (ctx, pt) => {
      osm("wasser").forEach((f) => zeichneFlaeche(ctx, pt, f.geometry));
      osm("wasserlinie").forEach((f) => {
        ctx.lineWidth = (WASSER_BREITE_SCHAETZUNG[f.properties.typ] || 2) * pxProM;
        zeichneLinie(ctx, pt, f.geometry);
      });
    });
    k.gruenFlaeche = zaehlePixel(gruen) * m2JePixel;
    k.wasserFlaeche = zaehlePixel(wasser) * m2JePixel;
    k.gruenWasserFlaeche = zaehlePixel(vereine([gruen, wasser])) * m2JePixel;
    // Bäume: Stämme im Rechteck zählen; Kronenüberdeckung aus den Kronenformen
    const imRechteckPunkt = ([x, y]) => x >= west && x <= ost && y >= sued && y <= nord;
    const stamm = baumFeatures.filter((f) => f.properties.form === "stamm" && imRechteckPunkt(f.geometry.coordinates));
    k.baeume = stamm.length;
    k.baeumeGeschaetzt = stamm.filter((f) => f.properties.q !== "osm").length;
    const kronen = malRaster(bbox, w, h, (ctx, pt) => baumFeatures.filter((f) => f.properties.form === "krone").forEach((f) => zeichneFlaeche(ctx, pt, f.geometry)));
    k.kronenFlaeche = zaehlePixel(kronen) * m2JePixel;
  }

  // Bauland (netto): Gebiet ohne Verkehr, Grün und Wasser
  const abzug = [verkehr, gruen, wasser].filter(Boolean);
  if (hatOsm && verkehr) {
    k.baulandFlaeche = flaeche - zaehlePixel(vereine(abzug)) * m2JePixel;
  } else if (hatOsm) {
    hinweise.push("Netto-Werte (Bauland ohne Verkehr, Grün, Wasser) fehlen, weil keine Verkehrsflächen vorliegen.");
  }
  hinweise.push("Bahnflächen sind noch nicht erfasst. Das Bauland ist daher eher zu groß, die Netto-Werte eher zu klein. Genauere Netto-Werte je Flurstück (ohne Verkehrsflächen) stehen im Reiter „Flurstücke“.");

  // Nutzung (LoD2-Code, sonst OSM-Gebäudeart) und Dachformen (nur LoD2)
  const nutzung = {};
  const zaehleNutzung = (name) => { nutzung[name] = (nutzung[name] || 0) + 1; };
  if (hatOsm) {
    k.gebaeude.forEach((g) => {
      const p = g.f.properties;
      zaehleNutzung((p.funktion && nutzungAusCode(p.funktion)) || nutzungAusOsm(p.bau));
    });
    k.nutzungQuelle = "LoD2-Gebäudecode, wo vorhanden, sonst OpenStreetMap-Gebäudeart";
  }
  const metaImRahmen = lod2Meta.filter((m) => m.punkt && m.punkt[0] >= west && m.punkt[0] <= ost && m.punkt[1] >= sued && m.punkt[1] <= nord);
  if (!hatOsm && metaImRahmen.length) {
    metaImRahmen.forEach((m) => zaehleNutzung(nutzungAusCode(m.funktion) || "Unbekannt"));
    k.nutzungQuelle = "LoD2-Gebäudecode";
  }
  k.nutzung = nutzung;
  k.dachformen = {};
  metaImRahmen.forEach((m) => { const n = DACHFORMEN[m.dachtyp] || "Unbekannt"; k.dachformen[n] = (k.dachformen[n] || 0) + 1; });
  k.anzahlLod2 = metaImRahmen.length;

  // Hinweise zur Vollständigkeit
  if (!hatOsm) hinweise.unshift("OpenStreetMap ist nicht geladen: Gebäudeflächen, Dichte, Grün, Wasser, Bäume und Straßenlängen fehlen.");
  if (!alkisVorhanden && hatOsm) hinweise.push("Keine amtlichen Straßenflächen geladen (außerhalb Niedersachsens oder Dienst nicht erreichbar).");
  if (!lod2Vorhanden) hinweise.push("Keine LoD2-Daten geladen: Geschosse stammen aus OpenStreetMap oder sind Ersatzwerte, Dachformen fehlen.");
  if (k.geschosseQuellen && k.gebaeude.length) {
    const q = k.geschosseQuellen;
    hinweise.push(`Geschosse: ${zahl(q.osm)} aus OpenStreetMap, ${zahl(q.lod2)} aus LoD2-Höhe (Traufhöhe geteilt durch ${GESCHOSSHOEHE_M} m), ` +
      `${zahl(q.ersatz)} Ersatzwert ${GESCHOSSE_ERSATZ}. Die Geschossfläche ist eine Schätzung.`);
  }
  hinweise.push("Daten sind nicht vermessungsgenau. Die Zuordnung der Nutzung und der Dachformen zu den Schlüsselnummern ist grob und nicht gegen die offiziellen Listen geprüft.");
  k.hinweise = hinweise;
  return k;
}

// ----- Darstellung -----
const fm2 = (m2) => (m2 >= 10_000 ? `${zahl(m2)} m² (${zahl(m2 / 10_000, 2)} ha)` : `${zahl(m2)} m²`);
const prozent = (anteil) => `${zahl(anteil * 100, 1)} %`;
const zahl2 = (x) => zahl(x, 2);
const nichtDa = "–";

function baueAbschnitte(k) {
  const A = k.flaeche;
  const abschnitte = [];

  abschnitte.push({ titel: "Gebiet", zeilen: [
    ["Fläche", fm2(A), "Größe des gewählten Rechtecks"],
    ["Breite × Höhe", `${zahl(k.breiteM)} × ${zahl(k.hoeheM)} m`, ""],
    ...(typeof gelaende !== "undefined" && gelaende ? [
      ["Geländehöhe", `${zahl(gelaende.min, 1)} bis ${zahl(gelaende.max, 1)} m`, "Über NHN, Höhenmodell DGM1 des LGLN, umschließendes Rechteck des Gebiets"],
      ["Höhenunterschied", `${zahl(gelaende.max - gelaende.min, 1)} m`, ""]
    ] : [])
  ] });

  if (k.hatOsm) {
    abschnitte.push({ titel: "Gebäude", intro: "Aus OpenStreetMap. Nebengebäude (Garagen, Schuppen, Carports) sind getrennt und nicht in der bebauten Fläche enthalten.", zeilen: [
      ["Gebäude (ohne Nebengebäude)", zahl(k.anzahlHaupt), "Gezählt nach ihrem Mittelpunkt im Gebiet"],
      ["Bebaute Fläche", fm2(k.grundflaeche), "Summe der Grundflächen, am Rand abgeschnitten"],
      ["Bebauungsanteil brutto", prozent(k.grundflaeche / A), "Bebaute Fläche geteilt durch das ganze Gebiet"],
      ["Nebengebäude", `${zahl(k.anzahlNeben)} · ${fm2(k.nebenFlaeche)}`, "Anzahl und Fläche"]
    ] });

    const gfzBrutto = k.geschossflaeche / A;
    const hatNetto = k.baulandFlaeche > 1;
    abschnitte.push({ titel: "Dichte", intro: "Brutto bezieht sich auf das ganze Gebiet, netto nur auf das Bauland (ohne Verkehr, Grün, Wasser). Netto liegt näher an den Werten eines Bebauungsplans.", zeilen: [
      ["Bauland (netto)", k.baulandFlaeche != null ? fm2(k.baulandFlaeche) : nichtDa, "Gebiet ohne Verkehrs-, Grün- und Wasserflächen"],
      ["GRZ brutto", zahl2(k.grundflaeche / A), "Grundflächenzahl des Quartiers, ganzes Gebiet"],
      ["GRZ netto", hatNetto ? zahl2(k.grundflaeche / k.baulandFlaeche) : nichtDa, "Grundflächenzahl bezogen auf das Bauland"],
      ["Mittlere Geschosszahl", zahl(k.mittlereGeschosse, 1), "Mittelwert der Gebäude, teils geschätzt (siehe Hinweise)"],
      ["Geschossfläche (geschätzt)", fm2(k.geschossflaeche), "Grundfläche mal Geschosse, je Gebäude"],
      ["GFZ brutto", zahl2(gfzBrutto), "Geschossflächenzahl des Quartiers, ganzes Gebiet"],
      ["GFZ netto", hatNetto ? zahl2(k.geschossflaeche / k.baulandFlaeche) : nichtDa, "Geschossflächenzahl bezogen auf das Bauland"]
    ] });
  }

  const verkehr = { titel: "Verkehr", zeilen: [] };
  if (k.verkehrFlaeche != null) {
    verkehr.zeilen.push([k.verkehrGeschaetzt ? "Verkehrsfläche (geschätzt)" : "Verkehrsfläche", `${fm2(k.verkehrFlaeche)} · ${prozent(k.verkehrFlaeche / A)}`,
      k.verkehrGeschaetzt ? "Straßenlinien mal angenommene Breite" : "Amtliche Straßen-, Weg- und Platzflächen zusammen"]);
  }
  if (k.alkisTeile) {
    verkehr.zeilen.push(["davon Straßenraum (Fahrbahn)", fm2(k.alkisTeile.strasse), "Amtliche Fläche „Straßenverkehr“"]);
    verkehr.zeilen.push(["davon Wege (auch Gehwege)", fm2(k.alkisTeile.weg), "Amtliche Fläche „Weg“"]);
    verkehr.zeilen.push(["davon Plätze und Fußgängerzonen", fm2(k.alkisTeile.platz), "Amtliche Fläche „Platz“, Code 5130 wie Platz gezählt"]);
  }
  if (k.laenge) {
    verkehr.zeilen.push(["Straßenlänge gesamt", `${zahl(k.laengeGesamt)} m`, "Aus OpenStreetMap-Linien, am Rand abgeschnitten"]);
    Object.keys(STRASSENARTEN).forEach((art) => {
      if (k.laenge[art]) verkehr.zeilen.push([`davon ${STRASSENARTEN[art]}`, `${zahl(k.laenge[art])} m`, ""]);
    });
  }
  if (verkehr.zeilen.length) abschnitte.push(verkehr);

  if (k.hatOsm) {
    abschnitte.push({ titel: "Grün und Wasser", intro: "Aus OpenStreetMap und, wo vorhanden, den amtlichen Gehölz- und Waldflächen. Überlappende Flächen sind nicht doppelt gezählt.", zeilen: [
      ["Grünfläche", `${fm2(k.gruenFlaeche)} · ${prozent(k.gruenFlaeche / A)}`, "Parks, Wiesen, Wald, Gärten, Spielplätze …"],
      ["Wasserfläche", `${fm2(k.wasserFlaeche)} · ${prozent(k.wasserFlaeche / A)}`, "Gewässerflächen und Flüsse (Linien mit geschätzter Breite)"],
      ["Grün + Wasser", prozent(k.gruenWasserFlaeche / A), "Anteil am Gebiet"],
      ["Einzelbäume", zahl(k.baeume), "OpenStreetMap-Bäume und Baumreihen (die Datenlage ist lückenhaft)"],
      ["Kronenüberdeckung", `${fm2(k.kronenFlaeche)} · ${prozent(k.kronenFlaeche / A)}`, `Fläche unter den Baumkronen. Größe aus OSM-Daten, bei ${zahl(k.baeumeGeschaetzt)} von ${zahl(k.baeume)} Bäumen geschätzt`]
    ] });

    abschnitte.push({ titel: "Flächenanteile", intro: "Anteil am Gebiet. Die Werte können sich minimal überschneiden.", balken: [
      { label: "Bebaute Fläche", wert: k.grundflaeche / A },
      ...(k.verkehrFlaeche != null ? [{ label: "Verkehr", wert: k.verkehrFlaeche / A }] : []),
      { label: "Grün", wert: k.gruenFlaeche / A },
      { label: "Wasser", wert: k.wasserFlaeche / A }
    ].map((b) => ({ ...b, text: prozent(b.wert) })) });
  }

  const nutzungSumme = Object.values(k.nutzung).reduce((s, v) => s + v, 0);
  if (nutzungSumme) {
    abschnitte.push({ titel: "Gebäude nach Nutzung", intro: `Anzahl der Gebäude. Quelle: ${k.nutzungQuelle}. Grobe Zuordnung.`,
      balken: Object.entries(k.nutzung).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ label: name, wert: n / nutzungSumme, text: `${zahl(n)} · ${prozent(n / nutzungSumme)}` })) });
  }
  if (k.anzahlLod2) {
    abschnitte.push({ titel: "Dachlandschaft", intro: `Dachformen der ${zahl(k.anzahlLod2)} Gebäude aus den amtlichen LoD2-Daten.`,
      balken: Object.entries(k.dachformen).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ label: name, wert: n / k.anzahlLod2, text: `${zahl(n)} · ${prozent(n / k.anzahlLod2)}` })) });
  }
  return abschnitte;
}

function kennzahlenAlsHtml(k, abschnitte) {
  const chip = (an, text) => `<span class="${an ? "ja" : "nein"}">${an ? "✓" : "✗"} ${text}</span>`;
  let html = `<div class="kz-stand">${chip(k.hatOsm, "OpenStreetMap")}${chip(k.hatAlkis, "Amtliche Straßenflächen")}${chip(k.hatLod2, "LoD2-Gebäude")}</div>`;
  for (const a of abschnitte) {
    html += `<h3>${a.titel}</h3>`;
    if (a.intro) html += `<p class="kz-intro">${a.intro}</p>`;
    if (a.zeilen) html += `<table class="kz-tabelle">${a.zeilen.map((z) => `<tr><td>${z[0]}</td><td>${z[1]}</td><td>${z[2]}</td></tr>`).join("")}</table>`;
    if (a.balken) html += `<div class="kz-balken">${a.balken.map((b) =>
      `<div><span>${b.label}</span><span class="leiste"><i style="width:${Math.min(100, Math.max(0, b.wert * 100)).toFixed(1)}%"></i></span><span class="zahl">${b.text}</span></div>`).join("")}</div>`;
  }
  html += `<div class="kz-hinweise"><strong>Hinweise zur Genauigkeit</strong><ul>${k.hinweise.map((h) => `<li>${h}</li>`).join("")}</ul></div>`;
  html += `<button class="btn kz-knopf" id="kz-kopieren">Kennzahlen als Text kopieren</button>`;
  return html;
}

function kennzahlenAlsText(k, abschnitte) {
  const zeilen = ["Ortsanalyse – Kennzahlen", ""];
  for (const a of abschnitte) {
    zeilen.push(a.titel.toUpperCase());
    (a.zeilen || []).forEach((z) => zeilen.push(`${z[0]}: ${z[1]}`));
    (a.balken || []).forEach((b) => zeilen.push(`${b.label}: ${b.text}`));
    zeilen.push("");
  }
  zeilen.push("Hinweise:", ...k.hinweise.map((h) => `- ${h}`), "");
  zeilen.push("Quellen: © OpenStreetMap-Mitwirkende (ODbL)" + (k.hatAlkis ? "; Straßenflächen © GeoBasis-DE/LGLN, Daten geändert" : "") + (k.hatLod2 ? "; LoD2 © GeoBasis-DE/LGLN, Daten geändert" : ""));
  return zeilen.join("\n");
}

let kennzahlenLetzte = null;   // zuletzt berechnete Kennzahlen (für den Export)

function aktualisiereKennzahlen() {
  if (!gebiet || !datenVorhanden) {
    kzFeld.innerHTML = `<div class="kz-leer"><h3>Noch keine Kennzahlen</h3><p>Wähle im Reiter „Karte“ ein Gebiet und klicke auf „Analysieren“. Die Kennzahlen erscheinen, sobald Daten geladen sind.</p></div>`;
    return;
  }
  kzFeld.innerHTML = "<p>Kennzahlen werden berechnet …</p>";
  setTimeout(() => {   // erst die Meldung zeigen, dann rechnen
    try {
      const k = berechneKennzahlen();
      const abschnitte = baueAbschnitte(k);
      kzFeld.innerHTML = kennzahlenAlsHtml(k, abschnitte);
      const text = kennzahlenAlsText(k, abschnitte);
      kennzahlenLetzte = { k, abschnitte };
      aktualisiereExport();
      document.getElementById("kz-kopieren").addEventListener("click", async (e) => {
        try { await navigator.clipboard.writeText(text); e.target.textContent = "Kopiert ✓"; }
        catch (_) { e.target.textContent = "Kopieren nicht möglich"; }
      });
    } catch (fehler) {
      console.error(fehler);
      kzFeld.innerHTML = `<div class="kz-leer"><h3>Kennzahlen nicht berechenbar</h3><p>${fehler.message}</p></div>`;
    }
  }, 30);
}

// ---------- 9. Bäume als Kronen ----------
// OpenStreetMap kennt die Bäume meist nur als Punkt. Damit der Plan nicht aus gleichen Kreisen besteht, zeichnen wir je Baum
// eine leicht unregelmäßige Krone. Die Größe kommt, in dieser Reihenfolge, aus: 1. dem Kronendurchmesser in OSM,
// 2. der Baumhöhe in OSM (Krone ca. halbe Höhe), 3. einem Standardwert mit etwas Streuung. Das Ergebnis ist eine Annahme,
// keine Messung. Form und Größe bleiben für denselben Baum immer gleich (Zufall aus der OSM-Nummer).
function hashWert(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function zufallsfolge(startwert) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function kronenGroesse(p, zufall) {
  if (p.krone >= 1 && p.krone <= 30) return { d: p.krone, quelle: "osm" };
  if (p.hoehe >= 3 && p.hoehe <= 45) return { d: Math.min(14, Math.max(3, p.hoehe * 0.5 * (0.85 + 0.3 * zufall()))), quelle: "hoehe" };
  return { d: (p.nadel ? 5 : 7) * (0.75 + 0.5 * zufall()), quelle: "standard" };
}
// Eine Krone als Vieleck: ein Kreis, dessen Radius sich sanft ändert; Nadelbäume als gezackte Form
function kronenForm(lon, lat, d, nadel, zufall) {
  const radius = d / 2;
  const punkte = nadel ? 16 : 28;
  const proM_Breite = 1 / 111320;
  const proM_Laenge = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  const phase = [zufall() * 6.283, zufall() * 6.283, zufall() * 6.283];
  const stärke = nadel ? [0.05, 0.04, 0.03] : [0.03 + 0.08 * zufall(), 0.02 + 0.06 * zufall(), 0.01 + 0.05 * zufall()];
  const versatz = [(zufall() - 0.5) * 0.15 * radius, (zufall() - 0.5) * 0.15 * radius];   // Krone sitzt nicht genau über dem Stamm
  const ring = [];
  for (let i = 0; i < punkte; i++) {
    const winkel = (i / punkte) * 2 * Math.PI;
    let r = radius * (1 + stärke[0] * Math.sin(winkel + phase[0]) + stärke[1] * Math.sin(2 * winkel + phase[1]) + stärke[2] * Math.sin(3 * winkel + phase[2]));
    if (nadel && i % 2) r *= 0.62;
    ring.push([lon + (versatz[0] + r * Math.cos(winkel)) * proM_Laenge, lat + (versatz[1] + r * Math.sin(winkel)) * proM_Breite]);
  }
  ring.push(ring[0]);
  return ring;
}

function setzeBaeume() {
  const ergebnis = [];
  const eintragen = (lon, lat, p, schluessel) => {
    const zufall = zufallsfolge(hashWert(schluessel));
    const { d, quelle } = kronenGroesse(p, zufall);
    ergebnis.push({ type: "Feature", properties: { form: "krone", nadel: p.nadel ? 1 : 0, d, q: quelle },
      geometry: { type: "Polygon", coordinates: [kronenForm(lon, lat, d, p.nadel, zufall)] } });
    ergebnis.push({ type: "Feature", properties: { form: "stamm", q: quelle, d, hoehe: p.hoehe, nadel: p.nadel ? 1 : 0 },
      geometry: { type: "Point", coordinates: [lon, lat] } });
  };
  for (const f of osmFeatures) {
    const p = f.properties;
    if (p.kat === "baum") {
      const [lon, lat] = f.geometry.coordinates;
      eintragen(lon, lat, p, p.nr || `${lon},${lat}`);
    } else if (p.kat === "baumreihe") {
      // Baumreihe: alle ca. 9 m ein Baum entlang der Linie
      const linien = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates];
      linien.forEach((koordinaten, nummer) => {
        const linie = turf.lineString(koordinaten);
        const laenge = turf.length(linie, { units: "meters" });
        for (let strecke = 4.5, i = 0; strecke < laenge; strecke += 9, i++) {
          const [lon, lat] = turf.along(linie, strecke / 1000, { units: "kilometers" }).geometry.coordinates;
          eintragen(lon, lat, p, `${p.nr}-${nummer}-${i}`);
        }
      });
    }
  }
  baumFeatures = ergebnis;
  map.getSource("baum-kronen").setData({ type: "FeatureCollection", features: ergebnis });
}
