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
    "strassen-rand", "strassen-flaeche", "strassen-amtlich", "strassen-amtlich-rand", "weg-fein","bahn-flaeche", "bahn", "baeume",
    "gebaeude-lage", "gebaeude-neben-hell", "gebaeude-umriss", "daecher", "daecher-linien", "rahmen"]
};

const PLAN_TITEL = {
  schwarzplan: "Schwarzplan",
  strassen: "Straßennetz",
  gruen: "Grün und Vegetation",
  lageplan: "Lageplan"
};

let planKarte = null;
let aktuellerPlan = "schwarzplan";
let nebenSichtbar = true;
let grundrisseSichtbar = false; // OSM-Grundrisse unter den Dachaufsichten im Lageplan
let mitDaechern = false;        // liegen LoD2-Dachaufsichten vor?
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
  "baeume", "verkehrsflaechen", "daecher", "rahmen"];

function ebenenAnlegen(breitengrad) {
  const k = planKarte;
  const osm = "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap-Mitwirkende</a> (ODbL)";
  for (const name of QUELLEN) {
    const optionen = { type: "geojson", data: leereSammlung };
    if (name === "gebaeude") optionen.attribution = osm; // Quellenangabe unten rechts
    if (name === "daecher") optionen.attribution = "Dächer: LGLN, 3D-Gebäudemodell LoD2 (CC BY 4.0)";
    if (name === "strassenAmtlich") optionen.attribution = "Straßenflächen: LGLN, DLM (CC BY 4.0) über topoexport";
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
    // Straßennetz-Plan: alle Straßen als breite Fläche in voller Straßenraumbreite, Grauton nach Kategorie
    { id: "netz-rand", type: "line", source: "strassen", filter: STRASSE_ALS_FLAECHE, layout: rund,
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": inMetern(["+", ["get", "breite"], 1.2], breitengrad) } },
    { id: "netz-flaeche", type: "line", source: "strassen", filter: STRASSE_ALS_FLAECHE,
      layout: { ...rund, "line-sort-key": rang },
      paint: { "line-color": ["match", ["get", "kategorie"], "haupt", STRASSEN_TOENE.haupt, "neben", STRASSEN_TOENE.neben,
          "wohn", STRASSEN_TOENE.wohn, STRASSEN_TOENE.fuss],
        "line-width": inMetern(["get", "breite"], breitengrad) } },
    // Schmale Wege: im Straßennetz schwarz gestrichelt, im Lageplan fein grau
    { id: "strasse-fuss", type: "line", source: "strassen", filter: ["!", STRASSE_ALS_FLAECHE],
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": mitZoom(0.7), "line-dasharray": [3, 2] } },
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
    { id: "gebaeude-umriss", type: "line", source: "gebaeude", filter: ["==", ["get", "art"], "haupt"],
      paint: { "line-color": PLAN_FARBEN.umriss, "line-width": mitZoom(0.7) } },
    { id: "daecher", type: "fill", source: "daecher", paint: { "fill-color": ["get", "farbe"], "fill-antialias": false } },
    // Dachkanten (First, Grate, Traufen) fein nachgezeichnet
    { id: "daecher-linien", type: "line", source: "daecher", layout: { "line-join": "round" },
      paint: { "line-color": "#5f5f5d", "line-width": mitZoom(0.45), "line-opacity": 0.85 } },
    // Rahmen des Untersuchungsgebiets
    { id: "rahmen", type: "line", source: "rahmen", paint: { "line-color": PLAN_FARBEN.akzent, "line-width": 1.2, "line-dasharray": [4, 3] } }
  ];
  for (const e of ebenen) k.addLayer({ ...e, layout: { ...(e.layout || {}), visibility: "none" } });
}

// Legenden-Einträge pro Plan: [Art des Zeichens, Farbe/Stärke, Text, Schalter?]
function legendeFuer(plan, k, amtlich) {
  const strassenFlaeche = amtlich ? "Straßenfläche (amtlich, LGLN)" : "Straßenfläche (aus OSM, typische Breite)";
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
      ["flaeche", PLAN_FARBEN.strasseLage, strassenFlaeche],
      ["linie", 0.6, "Fuß- und Radweg"],
      ["strich", "#555555", "Bahn"],
      ["flaeche", PLAN_FARBEN.park, "Park, Garten, Friedhof"],
      ["flaeche", PLAN_FARBEN.wald, "Wald"],
      ["flaeche", PLAN_FARBEN.wiese, "Wiese, Rasen"],
      ["flaeche", PLAN_FARBEN.wasser, "Wasser"],
      ["kreis", PLAN_FARBEN.baum, "Einzelbaum"]
    ];
  }
  return [];
}

function zeichen([art, wert]) {
  if (art === "flaeche") return `<span class="lz lz-flaeche" style="background:${wert}"></span>`;
  if (art === "linie") return `<span class="lz lz-linie"><span style="height:${Math.max(1, wert * 0.8)}px"></span></span>`;
  if (art === "strich") return `<span class="lz lz-strich" style="border-color:${wert}"></span>`;
  if (art === "kreis") return `<span class="lz lz-kreis" style="border-color:${wert}"></span>`;
  return "";
}

function zeigeLegende() {
  const box = document.getElementById("plan-legende");
  const eintraege = planLegenden[aktuellerPlan] || [];
  box.innerHTML = `
    <h3>${PLAN_TITEL[aktuellerPlan]}</h3>
    <ul>${eintraege.map((e) => `<li>${zeichen(e)}<span>${e[2]}</span>${
      e[3] === "neben" ? `<label class="schalter"><input type="checkbox" id="neben-schalter" ${nebenSichtbar ? "checked" : ""}> zeigen</label>` :
      e[3] === "grundrisse" ? `<label class="schalter"><input type="checkbox" id="grundriss-schalter" ${grundrisseSichtbar ? "checked" : ""}> zeigen</label>` : ""
    }</li>`).join("")}</ul>
    <p class="legende-quelle">${document.getElementById("plan").dataset.quelle || ""}</p>`;
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
  mitDaechern = !!(daecher && daecher.features.length);
  const amtlich = !!(daten.strassenAmtlich && daten.strassenAmtlich.features.length);
  for (const plan of Object.keys(PLAN_EBENEN)) planLegenden[plan] = legendeFuer(plan, kennzahlen, amtlich);
  zeigePlan(aktuellerPlan);
}
