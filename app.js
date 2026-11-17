/* ============================================================
   Ortsanalyse – Hauptlogik
   1. Karte von Oldenburg anzeigen (schwarz-weiß)
   2. Rechteck aufziehen und Größe anzeigen
   3. Reiter (Tabs) für die Ansichten umschalten
   4. „Analysieren“: OSM-Daten laden (osm.js), Kennzahlen rechnen
      (kennzahlen.js) und die 2D-Pläne zeichnen (plaene.js)
   ============================================================ */

// höchstens ca. 1 km² (etwas Spielraum, weil der topoexport-Ausschnitt 1012 × 1009 m groß ist)
const MAX_FLAECHE_M2 = 1_100_000;
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
    paint: { "fill-color": "#e535b8", "fill-opacity": 0.08 } });
  map.addLayer({ id: "gebiet-rand", type: "line", source: "gebiet",
    paint: { "line-color": "#e535b8", "line-width": 2, "line-dasharray": [3, 2] } });
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
  analyseHint.textContent = zuGross ? "Gebiet zu groß (höchstens ca. 1 km²)." : "Bereit. Klicke auf „Analysieren“.";
  if (typeof zeigeKachelStatus === "function") zeigeKachelStatus(); // benötigte LoD2-Kacheln (import.js)
}

// Ein Gebiet von außen setzen (z. B. nach dem Import der topoexport-Ausschnitt), bbox = [W, S, O, N]
function setzeGebiet(bbox) {
  if (zeichnen) zeichenmodus(false);
  gebiet = turf.bboxPolygon(bbox);
  const zeige = () => { zeigeRechteck(gebiet); map.fitBounds(bbox, { padding: 60, duration: 0 }); };
  map.getSource("gebiet") ? zeige() : map.once("load", zeige); // erst zeichnen, wenn die Karte bereit ist
  aktualisiereAngaben(gebiet);
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
// Schwarzplan, Straßennetz, Grün und Lageplan teilen sich die Ansicht „plan“.
const PLAENE = ["schwarzplan", "strassen", "gruen", "lageplan", "flurstuecke", "boden", "wohnen", "infra", "schnitt"];

function zeigeAnsicht(ziel) {
  const sektion = PLAENE.includes(ziel) ? "plan" : ziel;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === ziel));
  const aktiverReiter = document.querySelector(".tab.is-active"); // ganz sichtbar machen, falls die Reiterleiste verschoben ist
  if (aktiverReiter) aktiverReiter.scrollIntoView({ block: "nearest", inline: "nearest" });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === sektion));
  if (ziel === "karte") map.resize(); // Karte nach dem Wiedereinblenden neu ausmessen
  if (sektion === "plan") {
    document.getElementById("plan-leer-titel").textContent = PLAN_TITEL[ziel];
    zeigePlan(ziel);
  }
  if (ziel === "export") zeigeExportReiter();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => zeigeAnsicht(tab.dataset.view));
});

// Legenden ein- und ausklappen: Klick auf die Überschrift der Legende
document.addEventListener("click", (e) => {
  const titel = e.target.closest(".plan-legende h3");
  if (titel) titel.parentElement.classList.toggle("eingeklappt");
});

// ---------- 4. Analysieren ----------
const btnBeispiel = document.getElementById("btn-beispiel");
let analyseLaeuft = false;
let analyseErgebnis = null; // Daten der letzten Analyse (für den Steckbrief beim Klick auf ein Flurstück)

function datumText(zeitstempel) {
  if (!zeitstempel) return "unbekannt";
  return new Date(zeitstempel).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

async function analysiere(nurBeispiel = false) {
  if (!gebiet || analyseLaeuft) return;
  analyseLaeuft = true;
  btnAnalyse.disabled = true;
  btnBeispiel.disabled = true;
  btnAnalyse.textContent = "Analysiere …";
  const bbox = turf.bbox(gebiet);
  const meldung = (text) => { analyseHint.textContent = text; };

  try {
    // 1. Daten holen: live von OSM oder aus den eingebauten Beispieldaten
    let rohdaten, herkunft;
    if (nurBeispiel) {
      meldung("Lade eingebaute Beispieldaten …");
      rohdaten = await ladeBeispielOsm();
      herkunft = "eingebaute Beispieldaten";
    } else {
      try {
        rohdaten = await ladeOsm(bbox, meldung);
        herkunft = "live abgefragt";
      } catch (fehler) {
        // Ersatz: Liegt das Gebiet im Oldenburger Testgebiet, nehmen wir die eingebauten Daten
        if (!liegtImBeispielgebiet(bbox)) throw fehler;
        meldung("OSM-Dienst nicht erreichbar, nehme die eingebauten Oldenburger Daten …");
        rohdaten = await ladeBeispielOsm();
        herkunft = "eingebaute Beispieldaten, weil der OSM-Dienst nicht erreichbar war";
      }
    }

    // 2. Aufbereiten und rechnen
    meldung("Bereite Daten auf und berechne Kennzahlen …");
    await new Promise((r) => setTimeout(r, 30)); // kurz Luft holen, damit die Meldung erscheint
    const daten = bereiteAuf(rohdaten, bbox);
    const quelleText = `Quelle: © OpenStreetMap-Mitwirkende (ODbL), Datenstand ${datumText(daten.datenstand)} (${herkunft})`;

    // Amtliche Daten (LoD2-Gebäude, Gelände, Straßenflächen): aus dem Import oder dem Oldenburger Beispiel
    let lod2Daten = null, lod2 = null, daecher = null;
    meldung("Lade amtliche 3D-Gebäude und Straßenflächen …");
    const amtlich = await amtlicheDaten(bbox, nurBeispiel);
    if (amtlich && amtlich.lod2Daten) {
      lod2Daten = amtlich.lod2Daten;
      lod2 = lod2Gebaeude(lod2Daten, bbox);
      daecher = dachflaechenGeoJSON(lod2Daten, lod2, bbox);
      // Detailstufen-Regel für die Eigenschaften: Höhe/Geschosse und Nutzung aus LoD2, wo vorhanden
      ergaenzeAusLod2(daten.gebaeude, lod2);
    }
    if (amtlich && amtlich.strassenDaten) {
      daten.strassenAmtlich = strassenflaechenGeoJSON(amtlich.strassenDaten, bbox);
      // OSM-Straßen nur dort als Fläche, wo keine amtliche Straßenfläche liegt (für die Netto-Rechnung)
      daten.strassenAussen = strassenAusserhalb(daten.strassen, daten.strassenAmtlich);
    }
    // Flurstücke, tatsächliche Nutzung und Bodenrichtwerte (offene LGLN-Dienste, Niedersachsen)
    meldung("Lade Flurstücke, Nutzung und Bodenrichtwerte (LGLN) …");
    try {
      daten.kataster = await ladeKataster(bbox);
    } catch (fehler) {
      console.warn("Katasterdaten nicht verfügbar:", fehler);
    }
    // Wohnen (Zensus 2022: Miete, Leerstand, Wohnfläche, Eigentum, Baujahr): Import oder eingebautes Beispiel
    meldung("Lade Zensus-Daten (Mieten, Baualter …) von destatis …");
    try { daten.zensus = await zensuszellen(bbox, nurBeispiel); } catch (fehler) { console.warn("Zensusdaten nicht verfügbar:", fehler); }
    // Infrastruktur (Haltestellen, Spielplätze, Läden …): eigene OSM-Abfrage, im Beispiel eingebaut
    try { daten.infra = await ladeInfrastruktur(bbox, nurBeispiel, meldung); } catch (fehler) { console.warn("Infrastruktur nicht verfügbar:", fehler); }
    meldung("Berechne Kennzahlen …");
    const kennzahlen = berechneKennzahlen(daten, bbox);
    // Für den Flurstücks-Steckbrief merken
    analyseErgebnis = { daten, lod2: lod2 || [], lod2Daten, bbox, kennzahlen, quelleText };
    const lgln = ((lod2 && lod2.length) || daten.strassenAmtlich
      ? " · Gebäude 3D und Straßenflächen: LGLN Niedersachsen (CC BY 4.0), teils über topoexport.com, nicht vermessungsgenau" : "")
      + (daten.kataster ? ` · ${daten.kataster.quelle}` : "")
      + (daten.zensus ? " · Wohnen (Miete, Leerstand, Wohnfläche, Eigentum, Baujahr): Zensus 2022, Statistische Ämter des Bundes und der Länder (dl-de/by-2-0)"
        + (Object.values(daten.zensus.quellen).includes("destatis") ? ", teils live über destatis „Mietvergleich“" : "") : "");

    // 3. Anzeigen: zuerst den Schwarzplan
    // (Kennzahlen und 3D zuerst: Sie hängen nicht davon ab, dass die Planansicht fertig geladen ist.)
    zeigeKennzahlen(kennzahlen, quelleText);
    zeichne3D({ bbox, lod2, lod2Daten, osmGebaeude: daten.gebaeude.features, baeume: daten.baeume, plan: daten, quelleText: quelleText + lgln });
    meldung("Zeichne die Pläne …");
    zeigeAnsicht("schwarzplan");
    await zeichnePlaene(daten, bbox, kennzahlen, quelleText + lgln, daecher);
    meldung(`Fertig: ${fmt(kennzahlen.gebaeudeAnzahl)} Gebäude, ${fmt(kennzahlen.strassenGesamt / 1000, 1)} km Straßen. Siehe Reiter oben.`);
  } catch (fehler) {
    console.error(fehler);
    meldung(`Die Daten konnten nicht geladen werden (${fehler.message}). Bitte in ein paar Minuten noch einmal versuchen.`);
  } finally {
    analyseLaeuft = false;
    btnAnalyse.textContent = "Analysieren";
    btnAnalyse.disabled = !gebiet || turf.area(gebiet) > MAX_FLAECHE_M2;
    btnBeispiel.disabled = false;
  }
}

btnAnalyse.addEventListener("click", () => analysiere(false));

// „Beispiel Oldenburg laden“: Testgebiet wählen und mit den eingebauten Daten analysieren
btnBeispiel.addEventListener("click", () => {
  setzeGebiet(BEISPIEL_GEBIET);
  analysiere(true);
});
