/* ============================================================
   Ortsanalyse – Logik (Grundgerüst)
   1. Karte von Oldenburg anzeigen (schwarz-weiß)
   2. Rechteck aufziehen und Größe anzeigen
   3. Reiter (Tabs) für die Ansichten umschalten
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

// Ebenen für das Rechteck anlegen, sobald die Karte bereit ist
map.on("load", () => {
  map.addSource("gebiet", { type: "geojson", data: leer });
  map.addLayer({ id: "gebiet-flaeche", type: "fill", source: "gebiet",
    paint: { "fill-color": "#e2482d", "fill-opacity": 0.08 } });
  map.addLayer({ id: "gebiet-rand", type: "line", source: "gebiet",
    paint: { "line-color": "#e2482d", "line-width": 2, "line-dasharray": [3, 2] } });
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
  analyseHint.textContent = zuGross ? "Gebiet zu groß (höchstens 1 km²)." : "Bereit. Die Analyse folgt in einem späteren Schritt.";
}

btnDraw.addEventListener("click", () => zeichenmodus(!zeichnen));

btnClear.addEventListener("click", () => {
  gebiet = null;
  zeigeRechteck(null);
  aktualisiereAngaben(null);
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
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const ziel = tab.dataset.view;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === ziel));
    if (ziel === "karte") map.resize(); // Karte nach dem Wiedereinblenden neu ausmessen
  });
});
