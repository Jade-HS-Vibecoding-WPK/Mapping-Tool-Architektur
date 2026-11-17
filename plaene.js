/* ============================================================
   Ortsanalyse – 2D-Pläne auf weißem Blatt
   Eine zweite Karte ohne Hintergrundkarte. Je nach Reiter werden
   andere Ebenen gezeigt: Schwarzplan, Straßennetz, Grün, Lageplan.
   Norden ist immer oben (Drehen ist abgeschaltet).
   ============================================================ */

const PLAN_FARBEN = {
  schwarz: "#111111",
  neben: "#9a9a9a",
  gebaeudeHell: "#e6e6e6",
  gebaeudeLage: "#f3f3f1",
  nebenLage: "#e0e0dd",
  umriss: "#4d4d4d",
  strasseLage: "#e9e9e6",
  strasseRand: "#8a8a8a",
  wegFein: "#a8a8a8",
  verkehrsflaeche: "#efefed",
  park: "#cfdcc4",
  wald: "#a9c29b",
  wiese: "#e2eadb",
  wasser: "#cdd9e0",
  wasserLinie: "#9fb4c1",
  baum: "#5b7f4f",
  akzent: "#e2482d"
};

// Grautöne der Straßenflächen im Straßennetz-Plan (je wichtiger, desto dunkler)
const STRASSEN_TOENE = { haupt: "#4a4a4a", neben: "#858585", wohn: "#c2c2c0", fuss: "#e4e4e1" };

// Welche Ebenen gehören zu welchem Plan?
const PLAN_EBENEN = {
  schwarzplan: ["gebaeude-haupt", "gebaeude-neben", "rahmen"],
  strassen: ["gebaeude-hell", "verkehrsflaechen", "bahn-flaeche", "bahn", "netz-rand", "netz-flaeche",
    "strasse-fuss", "rahmen"],
  gruen: ["gebaeude-hell", "gruen-wiese", "gruen-park", "gruen-wald", "wasser", "wasser-linien", "baeume", "rahmen"],
  lageplan: ["gruen-wiese", "gruen-park", "gruen-wald", "wasser", "wasser-linien", "verkehrsflaechen",
    "lage-rand", "lage-flaeche", "weg-fein", "bahn-flaeche", "bahn", "baeume",
    "aussparung-flaeche", "aussparung-grundriss", "aussparung-dach", "gebaeude-lage", "gebaeude-neben-hell",
    "gebaeude-umriss", "daecher", "daecher-linien", "rahmen"],
  boden: ["brw-flaeche", "brw-rand", "parzellen-boden", "gebaeude-kontur", "rahmen"],
  flurstuecke: ["flst-flaeche", "daecher", "daecher-linien", "flst-linie", "flst-auswahl", "rahmen"],
  wohnen: ["zensus-flaeche", "zensus-rand", "gebaeude-kontur", "rahmen"],
  infra: ["wasser", "gebaeude-hell", "infra-radius-halt", "infra-radius-halt-rand", "infra-radius-spiel", "infra-radius-spiel-rand",
    "rahmen", ...Object.keys(INFRA_EBENEN).map((e) => `infra-${e}`)]
};

const PLAN_TITEL = {
  schwarzplan: "Schwarzplan",
  strassen: "Straßennetz",
  gruen: "Grün und Vegetation",
  lageplan: "Lageplan",
  boden: "Bodenrichtwerte",
  flurstuecke: "Flurstücke und Dachaufsichten",
  wohnen: "Wohnen (Zensus 2022)",
  infra: "Infrastruktur (OSM)"
};

let planKarte = null;
let aktuellerPlan = "schwarzplan";
let nebenSichtbar = true;
let grundrisseSichtbar = false; // OSM-Grundrisse unter den Dachaufsichten im Lageplan
let mitDaechern = false;        // liegen LoD2-Dachaufsichten vor?
let parzellenSichtbar = true;   // Flurstücksgrenzen im Lageplan
let mitParzellen = false;       // liegen Flurstücke vor?
let brwMarker = [];             // Beschriftungen der Bodenrichtwerte
let brwDaten = null;
let zensusKlassen = {};         // Farbklassen je Zensus-Merkmal (Reiter „Wohnen“)
let zensusMerkmal = "miete";    // gerade gezeigtes Merkmal im Reiter „Wohnen“
let infraDaten = null;          // Punkte und Einzugsradien (Reiter „Infrastruktur“)
const infraSichtbar = Object.fromEntries(Object.keys(INFRA_EBENEN).map((e) => [e, true])); // Ebenen an/aus
const radienSichtbar = { halt: false, spiel: false };                                     // Einzugsradien an/aus
let infraPopup = null;          // Fenster nach Klick auf einen Ort
let planLegenden = {};

// Linienbreite, die beim Zoomen mitwächst (Wert in Pixeln bei Zoomstufe 16)
const mitZoom = (px16) => ["interpolate", ["exponential", 1.6], ["zoom"], 12, px16 * 0.15, 16, px16, 20, px16 * 6];

// Breite in echten Metern (z. B. Straße 8 m), umgerechnet in Pixel je Zoomstufe
function inMetern(meterAusdruck, breitengrad) {
  const proPixelBeiZoom0 = 40075016.686 * Math.cos(breitengrad * Math.PI / 180) / 512;
  return ["interpolate", ["exponential", 2], ["zoom"],
    0, ["/", meterAusdruck, proPixelBeiZoom0],
    24, ["/", ["*", meterAusdruck, 2 ** 24], proPixelBeiZoom0]];
}

// Straßen ab 5 m Breite werden als Fläche gezeichnet, schmale Wege als feine Linie
const STRASSE_ALS_FLAECHE = [">=", ["get", "breite"], 5];
const FAHRBAHN_FAKTOR = 0.75; // gezeichnete Breite = 75 % des typischen Straßenraums
const LAGEPLAN_FAKTOR = 0.55; // im Lageplan feiner: 55 % des typischen Straßenraums
const NETZ_FAKTOR = 0.65;     // im Straßennetz: 65 % des typischen Straßenraums

function erstellePlanKarte(bbox) {
  planKarte = new maplibregl.Map({
    container: "plan",
    bounds: bbox,
    fitBoundsOptions: { padding: 40 },
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    preserveDrawingBuffer: true,
    style: { version: 8, sources: {}, layers: [{ id: "papier", type: "background", paint: { "background-color": "#ffffff" } }] }
  });
  planKarte.touchZoomRotate.disableRotation();
  planKarte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  planKarte.addControl(new maplibregl.ScaleControl({ maxWidth: 160, unit: "metric" }), "bottom-left");
  planKarte.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
  return new Promise((ok) => planKarte.on("load", ok));
}

const leereSammlung = { type: "FeatureCollection", features: [] };
const QUELLEN = ["gebaeude", "strassen", "strassenOsmFlaeche", "strassenAmtlich", "bahn", "gruen", "wasserLinien",
  "baeume", "verkehrsflaechen", "daecher", "parzellen", "brw", "zensus", "infra", "infraRadien", "rahmen"];

function ebenenAnlegen(breitengrad) {
  const k = planKarte;
  const osm = "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap-Mitwirkende</a> (ODbL)";
  for (const name of QUELLEN) {
    const optionen = { type: "geojson", data: leereSammlung };
    if (name === "gebaeude") optionen.attribution = osm; // Quellenangabe unten rechts
    if (name === "daecher") optionen.attribution = "Dächer: LGLN, 3D-Gebäudemodell LoD2 (CC BY 4.0)";
    if (name === "strassenAmtlich") optionen.attribution = "Straßenflächen: LGLN, DLM (CC BY 4.0) über topoexport";
    if (name === "parzellen") optionen.attribution = `Flurstücke: LGLN (${new Date().getFullYear()}), CC BY 4.0`;
    if (name === "brw") optionen.attribution = "Bodenrichtwerte: BORIS-NI (dl-de/by-2-0)";
    if (name === "zensus") optionen.attribution = "Wohnen: Zensus 2022 (dl-de/by-2-0)";
    if (name === "infra") optionen.attribution = "Piktogramme: Maki (CC0)";
    k.addSource(name, optionen);
  }
  const filterKat = (kat) => ["==", ["get", "kategorie"], kat];
  const rund = { "line-cap": "round", "line-join": "round" };
  const rang = ["match", ["get", "kategorie"], "haupt", 4, "neben", 3, "wohn", 2, 1];
  const ebenen = [
    // Grün und Wasser (Flächen)
    { id: "gruen-wiese", type: "fill", source: "gruen", filter: filterKat("wiese"), paint: { "fill-color": PLAN_FARBEN.wiese } },
    { id: "gruen-park", type: "fill", source: "gruen", filter: filterKat("park"), paint: { "fill-color": PLAN_FARBEN.park } },
    { id: "gruen-wald", type: "fill", source: "gruen", filter: filterKat("wald"), paint: { "fill-color": PLAN_FARBEN.wald } },
    { id: "wasser", type: "fill", source: "gruen", filter: filterKat("wasser"), paint: { "fill-color": PLAN_FARBEN.wasser } },
    { id: "wasser-linien", type: "line", source: "wasserLinien", layout: rund,
      paint: { "line-color": PLAN_FARBEN.wasserLinie, "line-width": inMetern(["get", "breite"], breitengrad) } },
    // Gebäude hellgrau als Orientierung (Straßennetz, Grün)
    { id: "gebaeude-hell", type: "fill", source: "gebaeude", paint: { "fill-color": PLAN_FARBEN.gebaeudeHell } },
    // Plätze und Parkplätze
    { id: "verkehrsflaechen", type: "fill", source: "verkehrsflaechen",
      paint: { "fill-color": PLAN_FARBEN.verkehrsflaeche, "fill-outline-color": PLAN_FARBEN.strasseRand } },
    // Straßen als Fläche mit Rand: erst alle Ränder (etwas breiter), dann alle Flächen darüber.
    // So verschmelzen Kreuzungen zu einer Fläche, und nur der äußere Rand bleibt als Linie stehen.
    // (Quelle „strassenOsmFlaeche“: OSM-Straßen außerhalb der amtlichen Straßenflächen)
    { id: "strassen-rand", type: "line", source: "strassenOsmFlaeche", filter: STRASSE_ALS_FLAECHE, layout: rund,
      paint: { "line-color": PLAN_FARBEN.strasseRand,
        "line-width": inMetern(["+", ["*", ["get", "breite"], FAHRBAHN_FAKTOR], 1.0], breitengrad) } },
    { id: "strassen-flaeche", type: "line", source: "strassenOsmFlaeche", filter: STRASSE_ALS_FLAECHE,
      layout: { ...rund, "line-sort-key": rang },
      paint: { "line-color": PLAN_FARBEN.strasseLage,
        "line-width": inMetern(["*", ["get", "breite"], FAHRBAHN_FAKTOR], breitengrad) } },
    // Amtliche Straßenflächen (genaue Ränder aus dem Landesamt)
    { id: "strassen-amtlich", type: "fill", source: "strassenAmtlich", paint: { "fill-color": PLAN_FARBEN.strasseLage } },
    { id: "strassen-amtlich-rand", type: "line", source: "strassenAmtlich",
      paint: { "line-color": PLAN_FARBEN.strasseRand, "line-width": mitZoom(0.8) } },
    // Straßennetz-Plan: alle Straßen als Fläche (NETZ_FAKTOR der Straßenraumbreite) mit feinem Rand, Grauton nach Kategorie
    { id: "netz-rand", type: "line", source: "strassen", filter: STRASSE_ALS_FLAECHE, layout: rund,
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": inMetern(["+", ["*", ["get", "breite"], NETZ_FAKTOR], 0.7], breitengrad) } },
    { id: "netz-flaeche", type: "line", source: "strassen", filter: STRASSE_ALS_FLAECHE,
      layout: { ...rund, "line-sort-key": rang },
      paint: { "line-color": ["match", ["get", "kategorie"], "haupt", STRASSEN_TOENE.haupt, "neben", STRASSEN_TOENE.neben,
          "wohn", STRASSEN_TOENE.wohn, STRASSEN_TOENE.fuss],
        "line-width": inMetern(["*", ["get", "breite"], NETZ_FAKTOR], breitengrad) } },
    // Schmale Wege: im Straßennetz schwarz gestrichelt, im Lageplan fein grau
    { id: "strasse-fuss", type: "line", source: "strassen", filter: ["!", STRASSE_ALS_FLAECHE],
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": mitZoom(0.5), "line-dasharray": [3, 2] } },
    { id: "weg-fein", type: "line", source: "strassen", filter: ["!", STRASSE_ALS_FLAECHE],
      paint: { "line-color": PLAN_FARBEN.wegFein, "line-width": mitZoom(0.6) } },
    // Bahn
    { id: "bahn-flaeche", type: "fill", source: "bahn", filter: ["==", ["get", "art"], "bahnflaeche"],
      paint: { "fill-color": PLAN_FARBEN.verkehrsflaeche } },
    { id: "bahn", type: "line", source: "bahn", filter: ["!=", ["get", "art"], "bahnflaeche"],
      paint: { "line-color": "#555555", "line-width": mitZoom(1.6), "line-dasharray": [4, 2] } },
    // Einzelbäume als Kreis in Kronengröße
    { id: "baeume", type: "circle", source: "baeume",
      paint: { "circle-radius": inMetern(["get", "kronenradius"], breitengrad), "circle-color": PLAN_FARBEN.baum,
        "circle-opacity": 0.25, "circle-stroke-color": PLAN_FARBEN.baum, "circle-stroke-width": 0.6 } },
    // Gebäude im Schwarzplan
    { id: "gebaeude-haupt", type: "fill", source: "gebaeude", filter: ["==", ["get", "art"], "haupt"], paint: { "fill-color": PLAN_FARBEN.schwarz } },
    { id: "gebaeude-neben", type: "fill", source: "gebaeude", filter: ["==", ["get", "art"], "neben"], paint: { "fill-color": PLAN_FARBEN.neben } },
    // Gebäude im Lageplan: hell, darauf die schattierten Dachflächen, darüber der Umriss
    { id: "gebaeude-lage", type: "fill", source: "gebaeude", filter: ["==", ["get", "art"], "haupt"], paint: { "fill-color": PLAN_FARBEN.gebaeudeLage } },
    { id: "gebaeude-neben-hell", type: "fill", source: "gebaeude", filter: ["==", ["get", "art"], "neben"],
      paint: { "fill-color": PLAN_FARBEN.nebenLage, "fill-outline-color": "#9a9a9a" } },
    // Lageplan: Straßen fein und einheitlich hell mit dünnem grauem Rand
    { id: "lage-rand", type: "line", source: "strassen", filter: STRASSE_ALS_FLAECHE, layout: rund,
      paint: { "line-color": "#9c9c9a", "line-width": inMetern(["+", ["*", ["get", "breite"], LAGEPLAN_FAKTOR], 0.6], breitengrad) } },
    { id: "lage-flaeche", type: "line", source: "strassen", filter: STRASSE_ALS_FLAECHE, layout: rund,
      paint: { "line-color": PLAN_FARBEN.strasseLage, "line-width": inMetern(["*", ["get", "breite"], LAGEPLAN_FAKTOR], breitengrad) } },
    // Reiter „Flurstücke“: Flächen zum Anklicken (unter den Dächern)
    { id: "flst-flaeche", type: "fill", source: "parzellen", paint: { "fill-color": "#ffffff" } },
    // Flurstücksgrenzen (fein, unter den Gebäuden)
    { id: "parzellen", type: "line", source: "parzellen", paint: { "line-color": "#8c8c8a", "line-width": mitZoom(0.45) } },
    // Aussparung: Gebäude (Grundriss und Dachaufsicht) mit schmalem weißen Saum über die Straßen legen,
    // damit Straßen die Gebäude nie überdecken
    { id: "aussparung-flaeche", type: "fill", source: "gebaeude", paint: { "fill-color": "#ffffff" } },
    { id: "aussparung-grundriss", type: "line", source: "gebaeude", paint: { "line-color": "#ffffff", "line-width": mitZoom(1.4) } },
    { id: "aussparung-dach", type: "line", source: "daecher", paint: { "line-color": "#ffffff", "line-width": mitZoom(1.4) } },
    { id: "gebaeude-umriss", type: "line", source: "gebaeude", filter: ["==", ["get", "art"], "haupt"],
      paint: { "line-color": PLAN_FARBEN.umriss, "line-width": mitZoom(0.7) } },
    { id: "daecher", type: "fill", source: "daecher", paint: { "fill-color": ["get", "farbe"], "fill-antialias": false } },
    // Dachkanten (First, Grate, Traufen) fein nachgezeichnet
    { id: "daecher-linien", type: "line", source: "daecher", layout: { "line-join": "round" },
      paint: { "line-color": "#5f5f5d", "line-width": mitZoom(0.45), "line-opacity": 0.85 } },
    // Reiter „Flurstücke“: Grenzen über den Dächern, ausgewähltes Flurstück in der Akzentfarbe
    { id: "flst-linie", type: "line", source: "parzellen", paint: { "line-color": "#2b2b2b", "line-width": mitZoom(0.9) } },
    { id: "flst-auswahl", type: "line", source: "parzellen", filter: ["==", ["get", "id"], ""],
      paint: { "line-color": PLAN_FARBEN.akzent, "line-width": mitZoom(2.6) } },
    // Reiter „Wohnen“: 100-m-Zellen nach dem gewählten Zensus-Merkmal abgestuft (Filter und Farbe setzt zeigeZensusMerkmal)
    { id: "zensus-flaeche", type: "fill", source: "zensus", paint: { "fill-color": "#f3d6cd" } },
    { id: "zensus-rand", type: "line", source: "zensus", paint: { "line-color": "#ffffff", "line-width": 1 } },
    // Bodenrichtwerte: Zonen nach Wert abgestuft (Farbskala wird beim Zeichnen an die Werte angepasst)
    { id: "brw-flaeche", type: "fill", source: "brw", paint: { "fill-color": "#f3d6cd" } },
    { id: "brw-rand", type: "line", source: "brw", paint: { "line-color": "#ffffff", "line-width": 1.5 } },
    { id: "parzellen-boden", type: "line", source: "parzellen", paint: { "line-color": "#3a3a3a", "line-width": mitZoom(0.35), "line-opacity": 0.35 } },
    { id: "gebaeude-kontur", type: "line", source: "gebaeude", paint: { "line-color": "#333333", "line-width": mitZoom(0.5), "line-opacity": 0.7 } },
    // Reiter „Infrastruktur“: Einzugsradien (unter den Piktogrammen)
    ...Object.entries(INFRA_RADIEN).flatMap(([key, r]) => [
      { id: `infra-radius-${key}`, type: "fill", source: "infraRadien", filter: ["==", ["get", "radius"], key],
        paint: { "fill-color": r.farbe, "fill-opacity": 0.1 } },
      { id: `infra-radius-${key}-rand`, type: "line", source: "infraRadien", filter: ["==", ["get", "radius"], key],
        paint: { "line-color": r.farbe, "line-width": 1.2, "line-dasharray": [3, 2] } }
    ]),
    // Rahmen des Untersuchungsgebiets
    { id: "rahmen", type: "line", source: "rahmen", paint: { "line-color": PLAN_FARBEN.akzent, "line-width": 1.2, "line-dasharray": [4, 3] } },
    // Reiter „Infrastruktur“: je Ebene eine Piktogramm-Ebene (ganz oben)
    ...Object.keys(INFRA_EBENEN).map((e) => ({ id: `infra-${e}`, type: "symbol", source: "infra", filter: ["==", ["get", "ebene"], e],
      layout: { "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-ignore-placement": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.45, 16, 0.8, 18, 1.1] } }))
  ];
  for (const e of ebenen) k.addLayer({ ...e, layout: { ...(e.layout || {}), visibility: "none" } });
  steckbriefAnmelden(); // Klick auf Flurstücke (steckbrief.js)
  // Klick auf einen Ort im Reiter „Infrastruktur“: Art und Name zeigen
  for (const e of Object.keys(INFRA_EBENEN)) {
    k.on("click", `infra-${e}`, (ev) => {
      const p = ev.features[0].properties, a = INFRA_ART[p.art];
      if (infraPopup) infraPopup.remove();
      infraPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "240px", className: "infra-popup" })
        .setLngLat(ev.features[0].geometry.coordinates)
        .setHTML(`<img src="${piktogrammUrl(p.art)}" alt=""><div><strong>${a.name}</strong>`
          + `<span>${p.name ? htmlSicher(p.name) : OHNE_NAMEN.has(p.art) ? "Name nicht angezeigt (Datenschutz)" : "ohne Namen in OSM"}</span>`
          + `<small>${INFRA_EBENEN[a.ebene].name}</small></div>`)
        .addTo(k);
    });
    k.on("mouseenter", `infra-${e}`, () => { k.getCanvas().style.cursor = "pointer"; });
    k.on("mouseleave", `infra-${e}`, () => { k.getCanvas().style.cursor = ""; });
  }
}

// Legenden-Einträge pro Plan: [Art des Zeichens, Farbe/Stärke, Text, Schalter?]
function legendeFuer(plan, k, amtlich) {
  const m = (wert) => `${fmt(wert)} m`;
  const kat = (key) => `${STRASSEN_KATEGORIEN[key]} · ${m(k.strassen[key])}`;
  switch (plan) {
    case "schwarzplan": return [
      ["flaeche", PLAN_FARBEN.schwarz, `Gebäude (${fmt(k.gebaeudeAnzahl)})`],
      ["flaeche", PLAN_FARBEN.neben, `Nebengebäude, Überdachungen (${fmt(k.nebenAnzahl)})`, "neben"]
    ];
    case "strassen": return [
      ["flaeche", STRASSEN_TOENE.haupt, kat("haupt")],
      ["flaeche", STRASSEN_TOENE.neben, kat("neben")],
      ["flaeche", STRASSEN_TOENE.wohn, kat("wohn")],
      ["strich", PLAN_FARBEN.schwarz, kat("fuss")],
      ["flaeche", STRASSEN_TOENE.fuss, "Fußgängerzone, Platz, Parkplatz"],
      ["strich", "#555555", "Bahn"]
    ];
    case "gruen": return [
      ["flaeche", PLAN_FARBEN.park, GRUEN_KATEGORIEN.park],
      ["flaeche", PLAN_FARBEN.wald, GRUEN_KATEGORIEN.wald],
      ["flaeche", PLAN_FARBEN.wiese, GRUEN_KATEGORIEN.wiese],
      ["flaeche", PLAN_FARBEN.wasser, GRUEN_KATEGORIEN.wasser],
      ["kreis", PLAN_FARBEN.baum, `Einzelbaum (${fmt(k.baeume)})`]
    ];
    case "lageplan": return [
      ...(mitDaechern ? [
        ["flaeche", "linear-gradient(135deg,#f6f6f4 0 50%,#9a9a98 50%)", "Gebäude, Dachaufsicht aus dem 3D-Modell (LoD2)"],
        ["flaeche", PLAN_FARBEN.gebaeudeLage, "Grundrisse aus OSM darunter", "grundrisse"]
      ] : [
        ["flaeche", PLAN_FARBEN.gebaeudeLage, "Gebäude (Dachformen nur mit LoD2-Daten)"],
        ["flaeche", PLAN_FARBEN.nebenLage, "Nebengebäude, Überdachungen", "neben"]
      ]),
      ["flaeche", PLAN_FARBEN.strasseLage, "Straße, Platz"],
      ["linie", 0.6, "Fuß- und Radweg"],
      ["strich", "#555555", "Bahn"],
      ["flaeche", PLAN_FARBEN.park, "Park, Garten, Friedhof"],
      ["flaeche", PLAN_FARBEN.wald, "Wald"],
      ["flaeche", PLAN_FARBEN.wiese, "Wiese, Rasen"],
      ["flaeche", PLAN_FARBEN.wasser, "Wasser"],
      ["kreis", PLAN_FARBEN.baum, "Einzelbaum"]
    ];
    case "boden": return brwDaten ? [
      ...brwDaten.klassen.map(([farbe, text]) => ["flaeche", farbe, `${text} €/m² (baureifes Land)`]),
      ["flaeche", "#e6e6e3", "übrige Flächen (Acker, Grünland u. a., meist unter 10 €/m²)"],
      ["linie", 0.5, "Flurstücksgrenze, Gebäudeumriss"],
      ["text", "", `Stichtag ${brwDaten.stichtag ? new Date(brwDaten.stichtag).toLocaleDateString("de-DE") : "–"} · Werte in €/m², Zahlen in den Zonen`]
    ] : [["text", "", "Keine Bodenrichtwerte für dieses Gebiet (bisher nur Niedersachsen, BORIS-NI)."]];
    case "flurstuecke": return mitParzellen ? [
      mitDaechern ? ["flaeche", "linear-gradient(135deg,#f6f6f4 0 50%,#9a9a98 50%)", "Gebäude, Dachaufsicht (LoD2)"]
        : ["flaeche", PLAN_FARBEN.gebaeudeLage, "Gebäude (Grundriss, ohne LoD2-Daten)"],
      ["linie", 1, `Flurstücksgrenze (ALKIS, ${fmt(k.parzellenAnzahl || 0)} Flurstücke)`],
      ["flaeche", PLAN_FARBEN.akzent, "ausgewähltes Flurstück"],
      ["text", "", "Klicke auf ein Flurstück, um seine Kennzahlen zu sehen."]
    ] : [["text", "", "Keine Flurstücke für dieses Gebiet (bisher nur Niedersachsen, ALKIS)."]];
    case "wohnen": return legendeWohnen();
  }
  return [];
}

// Legende im Reiter „Infrastruktur“: je Ebene ein Schalter, darunter die Arten mit Piktogramm und Anzahl;
// zum Schluss die Einzugsradien mit dem Anteil des Gebiets, der abgedeckt ist
function legendeInfraHtml() {
  if (!infraDaten) return `<p class="legende-hilfe">Keine Infrastruktur-Daten: Der OSM-Dienst war nicht erreichbar. Bitte später erneut analysieren.</p>`;
  const anzahl = infraDaten.anzahl;
  const ebenen = Object.entries(INFRA_EBENEN).map(([e, d]) => {
    const arten = INFRA_ARTEN.filter(([art, ebene]) => ebene === e && anzahl[art]);
    const summe = arten.reduce((s, [art]) => s + anzahl[art], 0);
    return `<li class="infra-ebene">
        <label class="infra-schalter"><input type="checkbox" data-ebene="${e}" ${infraSichtbar[e] ? "checked" : ""} ${summe ? "" : "disabled"}>
          <span class="infra-farbe" style="background:${d.farbe}"></span><strong>${d.name}</strong><span class="infra-zahl">${fmt(summe)}</span></label>
        ${arten.length && infraSichtbar[e] ? `<ul>${arten.map(([art, , name]) =>
          `<li><img src="${piktogrammUrl(art)}" alt=""><span>${name}</span><span class="infra-zahl">${fmt(anzahl[art])}</span></li>`).join("")}</ul>` : ""}
      </li>`;
  }).join("");
  const radien = Object.entries(INFRA_RADIEN).map(([key, r]) => `
      <li><label class="infra-schalter"><input type="checkbox" data-radius="${key}" ${radienSichtbar[key] ? "checked" : ""} ${infraDaten.radien[key] ? "" : "disabled"}>
        <span class="lz lz-flaeche" style="background:${r.farbe}1f;border:1px dashed ${r.farbe}"></span>
        <span>${r.radius} m um ${r.name}</span><span class="infra-zahl">${prozent(infraDaten.abdeckung[key], 0)}</span></label></li>`).join("");
  return `<ul class="infra-legende">${ebenen}</ul>
    <p class="legende-hilfe">Einzugsradius (Luftlinie) · Zahl = Anteil des Gebiets, der abgedeckt ist</p>
    <ul class="infra-legende">${radien}</ul>
    <p class="legende-hilfe">Klicke auf ein Piktogramm für Art und Name. Daten aus OSM, oft unvollständig (${infraDaten.herkunft}).</p>`;
}

// Legende im Reiter „Wohnen“: hängt vom gewählten Zensus-Merkmal ab
function legendeWohnen() {
  const d = ZENSUS_MERKMALE[zensusMerkmal];
  const klassen = zensusKlassen[zensusMerkmal] && zensusKlassen[zensusMerkmal].klassen;
  if (!klassen) return [["text", "", `Keine Zensus-Daten „${d.name}“ für dieses Gebiet. Lege die ZIP „${d.zip}“ von destatis.de ins Ablagefeld.`]];
  return [
    ...klassen.map(([farbe, text]) => ["flaeche", farbe, zensusMerkmal === "baujahr" ? text : `${text}${d.einheit ? ` ${d.einheit}` : ""}`]),
    ["linie", 0.5, "Gebäude (Umriss)"],
    ["text", "", `${d.name}: ${d.erklaerung}. Wert je 100-m-Zelle am 15.05.2022. Zellen ohne Wohnungen fehlen.`]
  ];
}

// Fünf Stufen mit etwa gleich vielen Zellen (Quantile) oder feste Grenzen: [Farbausdruck, Legenden-Klassen]
function quantilStufen(werte, feld, stellen, festeGrenzen) {
  const sortiert = [...werte].sort((a, b) => a - b);
  const grenzen = festeGrenzen ? [...festeGrenzen] : [];
  for (let i = 1; !festeGrenzen && i < BRW_FARBEN.length; i++) {
    const g = sortiert[Math.floor(sortiert.length * i / BRW_FARBEN.length)];
    // nur echte Grenzen: größer als der kleinste Wert und als die vorige Grenze (z. B. viele Zellen mit 0 % Leerstand)
    if (g > sortiert[0] && (!grenzen.length || g > grenzen[grenzen.length - 1])) grenzen.push(g);
  }
  const farben = BRW_FARBEN.slice(BRW_FARBEN.length - grenzen.length - 1);
  const z = (v) => fmt(v, stellen);
  const klassen = farben.map((farbe, i) => [farbe, !grenzen.length ? z(sortiert[0])
    : i === 0 ? `unter ${z(grenzen[0])}` : i === grenzen.length ? `ab ${z(grenzen[i - 1])}` : `${z(grenzen[i - 1])} bis unter ${z(grenzen[i])}`]);
  const ausdruck = grenzen.length ? ["step", ["get", feld], farben[0], ...grenzen.flatMap((g, i) => [g, farben[i + 1]])] : farben[0];
  return [ausdruck, klassen];
}

// Baualter: sechs Epochen, alt = dunkel, neu = hell
const BAUJAHR_FARBEN = ["#5e1a0e", "#8f2615", "#e2482d", "#ec8a72", "#f5c4b6", "#fbebe6"];

// Im Reiter „Wohnen“ ein anderes Merkmal zeigen (Knöpfe in der Legende)
function zeigeZensusMerkmal(m) {
  zensusMerkmal = m;
  if (planKarte && planKarte.getLayer("zensus-flaeche")) {
    const feld = m === "baujahr" ? "baujahr" : m;
    planKarte.setFilter("zensus-flaeche", ["has", feld]);
    planKarte.setFilter("zensus-rand", ["has", feld]);
    const stufen = zensusKlassen[m];
    planKarte.setPaintProperty("zensus-flaeche", "fill-color", stufen ? stufen.ausdruck : "#f3d6cd");
  }
  planLegenden.wohnen = legendeWohnen();
  if (aktuellerPlan === "wohnen") zeigeLegende();
}

// Umschaltknöpfe über der Legende (Merkmale ohne Daten sind ausgegraut)
function zensusKnoepfe() {
  return `<div class="zensus-knoepfe">${Object.entries(ZENSUS_MERKMALE).map(([m, d]) =>
    `<button class="btn btn-klein ${m === zensusMerkmal ? "" : "btn-ghost"}" data-merkmal="${m}" ${zensusKlassen[m] ? "" : "disabled"}
      title="${d.name}">${d.knopf}</button>`).join("")}</div>`;
}

// Farbskala der Bodenrichtwerte (hell = günstig, dunkel = teuer), mit der Akzentfarbe
const BRW_FARBEN = ["#fbebe6", "#f5c4b6", "#ec8a72", "#e2482d", "#8f2615"];

function zeichen([art, wert]) {
  if (art === "flaeche") return `<span class="lz lz-flaeche" style="background:${wert}"></span>`;
  if (art === "linie") return `<span class="lz lz-linie"><span style="height:${Math.max(1, wert * 0.8)}px"></span></span>`;
  if (art === "strich") return `<span class="lz lz-strich" style="border-color:${wert}"></span>`;
  if (art === "kreis") return `<span class="lz lz-kreis" style="border-color:${wert}"></span>`;
  return ""; // „text“: nur Text, ohne Zeichen
}

function zeigeLegende() {
  const box = document.getElementById("plan-legende");
  const eintraege = planLegenden[aktuellerPlan] || [];
  box.innerHTML = `
    <h3>${PLAN_TITEL[aktuellerPlan]}</h3>
    ${aktuellerPlan === "wohnen" ? zensusKnoepfe() : ""}
    ${aktuellerPlan === "infra" ? legendeInfraHtml() : ""}
    <ul>${eintraege.map((e) => `<li>${zeichen(e)}<span>${e[2]}</span>${
      e[3] === "neben" ? `<label class="schalter"><input type="checkbox" id="neben-schalter" ${nebenSichtbar ? "checked" : ""}> zeigen</label>` :
      e[3] === "grundrisse" ? `<label class="schalter"><input type="checkbox" id="grundriss-schalter" ${grundrisseSichtbar ? "checked" : ""}> zeigen</label>` :
      e[3] === "parzellen" ? `<label class="schalter"><input type="checkbox" id="parzellen-schalter" ${parzellenSichtbar ? "checked" : ""}> zeigen</label>` : ""
    }</li>`).join("")}</ul>
    <p class="legende-quelle">${document.getElementById("plan").dataset.quelle || ""}</p>`;
  box.querySelectorAll(".zensus-knoepfe button").forEach((b) => b.addEventListener("click", () => zeigeZensusMerkmal(b.dataset.merkmal)));
  box.querySelectorAll("input[data-ebene]").forEach((c) => c.addEventListener("change", () => { infraSichtbar[c.dataset.ebene] = c.checked; zeigePlan(aktuellerPlan); }));
  box.querySelectorAll("input[data-radius]").forEach((c) => c.addEventListener("change", () => { radienSichtbar[c.dataset.radius] = c.checked; zeigePlan(aktuellerPlan); }));
  const parz = document.getElementById("parzellen-schalter");
  if (parz) parz.addEventListener("change", () => { parzellenSichtbar = parz.checked; zeigePlan(aktuellerPlan); });
  const schalter = document.getElementById("neben-schalter");
  if (schalter) schalter.addEventListener("change", () => { nebenSichtbar = schalter.checked; zeigePlan(aktuellerPlan); });
  const grundriss = document.getElementById("grundriss-schalter");
  if (grundriss) grundriss.addEventListener("change", () => { grundrisseSichtbar = grundriss.checked; zeigePlan(aktuellerPlan); });
}

// Einen Plan zeigen: passende Ebenen ein-, alle anderen ausblenden
function zeigePlan(plan) {
  aktuellerPlan = plan;
  if (!planKarte || !planKarte.getLayer("rahmen")) return; // Planansicht wird noch aufgebaut
  planKarte.resize();
  const sichtbar = new Set(PLAN_EBENEN[plan]);
  if (!nebenSichtbar) { sichtbar.delete("gebaeude-neben"); sichtbar.delete("gebaeude-neben-hell"); }
  // Lageplan mit LoD2: nur die Dachaufsichten, die OSM-Grundrisse darunter nur auf Wunsch
  if (mitDaechern && !grundrisseSichtbar) ["gebaeude-lage", "gebaeude-neben-hell", "gebaeude-umriss"].forEach((e) => sichtbar.delete(e));
  if (!parzellenSichtbar) sichtbar.delete("parzellen");
  // Reiter „Flurstücke“ ohne LoD2-Daten: Grundrisse statt Dachaufsichten
  if (plan === "flurstuecke" && !mitDaechern) ["gebaeude-lage", "gebaeude-umriss"].forEach((e) => sichtbar.add(e));
  if (plan !== "flurstuecke") schliesseSteckbrief();
  // Infrastruktur: ausgeschaltete Ebenen und Radien weglassen
  for (const e of Object.keys(INFRA_EBENEN)) if (!infraSichtbar[e]) sichtbar.delete(`infra-${e}`);
  for (const r of Object.keys(INFRA_RADIEN)) if (!radienSichtbar[r]) { sichtbar.delete(`infra-radius-${r}`); sichtbar.delete(`infra-radius-${r}-rand`); }
  if (infraPopup && plan !== "infra") { infraPopup.remove(); infraPopup = null; }
  // Beschriftung der Bodenrichtwerte nur im Plan „Bodenrichtwerte“
  brwMarker.forEach((m) => m.remove());
  brwMarker = [];
  if (plan === "boden" && brwDaten) {
    for (const f of brwDaten.zonen.features) {
      if (f.properties.zustand !== "B" || turf.area(f) < 1500) continue; // nur Bauland, keine kleinen Zonenreste
      const el = document.createElement("div");
      el.className = "brw-etikett";
      el.textContent = `${fmt(f.properties.wert)} €`;
      brwMarker.push(new maplibregl.Marker({ element: el }).setLngLat(turf.pointOnFeature(f).geometry.coordinates).addTo(planKarte));
    }
  }
  for (const ebene of planKarte.getStyle().layers) {
    if (ebene.id === "papier") continue;
    planKarte.setLayoutProperty(ebene.id, "visibility", sichtbar.has(ebene.id) ? "visible" : "none");
  }
  // Straßenflächen: im Straßennetz etwas dunkler mit dunklem Rand (darauf die Achsen), im Lageplan hell
  const imNetz = plan === "strassen";
  const flaeche = imNetz ? "#e3e3e0" : PLAN_FARBEN.strasseLage, rand = imNetz ? "#6a6a6a" : PLAN_FARBEN.strasseRand;
  planKarte.setPaintProperty("strassen-flaeche", "line-color", flaeche);
  planKarte.setPaintProperty("strassen-amtlich", "fill-color", flaeche);
  planKarte.setPaintProperty("strassen-rand", "line-color", rand);
  planKarte.setPaintProperty("strassen-amtlich-rand", "line-color", rand);
  zeigeLegende();
}

// Nach der Analyse: Daten in die Planansicht übernehmen
async function zeichnePlaene(daten, bbox, kennzahlen, quelleText, daecher) {
  const breitengrad = (bbox[1] + bbox[3]) / 2;
  document.getElementById("plan").dataset.quelle = quelleText;
  document.getElementById("plan-leer").hidden = true;
  if (!planKarte) {
    await erstellePlanKarte(bbox);
    ebenenAnlegen(breitengrad);
  } else {
    planKarte.fitBounds(bbox, { padding: 40, duration: 0 });
  }
  for (const name of ["gebaeude", "strassen", "bahn", "gruen", "wasserLinien", "baeume", "verkehrsflaechen"]) {
    planKarte.getSource(name).setData(daten[name]);
  }
  planKarte.getSource("strassenOsmFlaeche").setData(daten.strassenAussen || daten.strassen);
  planKarte.getSource("strassenAmtlich").setData(daten.strassenAmtlich || leereSammlung);
  planKarte.getSource("daecher").setData(daecher || leereSammlung);
  planKarte.getSource("rahmen").setData(turf.bboxPolygon(bbox));
  // Flurstücke und Bodenrichtwerte (nur wenn vorhanden, bisher Niedersachsen)
  const kat = daten.kataster;
  planKarte.getSource("parzellen").setData(kat ? kat.flurstuecke : leereSammlung);
  mitParzellen = !!(kat && kat.flurstuecke.features.length);
  // Zonen ohne Bauland (z. B. Acker, Grünland) decken oft das ganze Gebiet ab: zuerst (= unten) zeichnen
  const istBau = (f) => (f.properties.zustand === "B" ? 1 : 0);
  const zonen = kat ? { type: "FeatureCollection", features: kat.bodenrichtwerte.features
    .filter((f) => f.properties.wert > 0).sort((a, b) => istBau(a) - istBau(b)) } : null;
  const bauland = zonen ? zonen.features.filter((f) => f.properties.zustand === "B").map((f) => f.properties.wert).sort((a, b) => a - b) : [];
  if (bauland.length) {
    // Fünf Stufen mit etwa gleich vielen Zonen (Quantile), nur für baureifes Land; andere Zonen grau
    const grenzen = [];
    for (let i = 1; i < BRW_FARBEN.length; i++) {
      const g = bauland[Math.floor(bauland.length * i / BRW_FARBEN.length)];
      if (!grenzen.length || g > grenzen[grenzen.length - 1]) grenzen.push(g);
    }
    const farben = BRW_FARBEN.slice(BRW_FARBEN.length - grenzen.length - 1);
    const stufe = ["step", ["get", "wert"], farben[0], ...grenzen.flatMap((g, i) => [g, farben[i + 1]])];
    planKarte.setPaintProperty("brw-flaeche", "fill-color", ["case", ["==", ["get", "zustand"], "B"], stufe, "#e6e6e3"]);
    const klassen = farben.map((farbe, i) => [farbe,
      i === 0 ? `unter ${fmt(grenzen[0])}` : i === grenzen.length ? `ab ${fmt(grenzen[i - 1])}` : `${fmt(grenzen[i - 1])} bis unter ${fmt(grenzen[i])}`]);
    brwDaten = { zonen, klassen, min: bauland[0], max: bauland[bauland.length - 1],
      stichtag: zonen.features.map((f) => f.properties.stichtag).sort().pop() };
  } else brwDaten = null;
  planKarte.getSource("brw").setData(zonen || leereSammlung);

  // Wohnen (Zensus): Farbstufen je Merkmal; Baualter nach Epochen, alles andere in fünf Quantil-Stufen
  zensusKlassen = {};
  const zellen = daten.zensus ? daten.zensus.features : [];
  for (const [m, d] of Object.entries(ZENSUS_MERKMALE)) {
    if (m === "baujahr") {
      const vorhanden = [...new Set(zellen.map((f) => f.properties.baujahr).filter((e) => e != null))].sort((a, b) => a - b);
      if (vorhanden.length) zensusKlassen[m] = {
        ausdruck: ["match", ["get", "baujahr"], ...BAUJAHR_FARBEN.flatMap((farbe, i) => [i, farbe]), "#dddddd"],
        klassen: vorhanden.map((i) => [BAUJAHR_FARBEN[i], `überwiegend ${BAUJAHR_EPOCHEN[i][0]} gebaut`])
      };
      continue;
    }
    const werte = zellen.map((f) => f.properties[m]).filter((v) => v != null);
    if (!werte.length) continue;
    const [ausdruck, klassen] = quantilStufen(werte, m, d.stellen, d.grenzen);
    zensusKlassen[m] = { ausdruck, klassen };
  }
  planKarte.getSource("zensus").setData(daten.zensus || leereSammlung);
  if (!zensusKlassen[zensusMerkmal]) zensusMerkmal = Object.keys(zensusKlassen)[0] || "miete";
  zeigeZensusMerkmal(zensusMerkmal);
  schliesseSteckbrief();

  // Infrastruktur: Piktogramme, Punkte und Einzugsradien
  await infraBilderLaden(planKarte);
  if (daten.infra) {
    infraDaten = { ...daten.infra, anzahl: kennzahlen.infraAnzahl, abdeckung: kennzahlen.infraAbdeckung };
    planKarte.getSource("infra").setData(daten.infra.punkte);
    planKarte.getSource("infraRadien").setData({ type: "FeatureCollection", features: Object.values(daten.infra.radien) });
  } else {
    infraDaten = null;
    planKarte.getSource("infra").setData(leereSammlung);
    planKarte.getSource("infraRadien").setData(leereSammlung);
  }
  if (infraPopup) { infraPopup.remove(); infraPopup = null; }

  mitDaechern = !!(daecher && daecher.features.length);
  const amtlich = !!(daten.strassenAmtlich && daten.strassenAmtlich.features.length);
  for (const plan of Object.keys(PLAN_EBENEN)) planLegenden[plan] = legendeFuer(plan, kennzahlen, amtlich);
  zeigePlan(aktuellerPlan);
}
