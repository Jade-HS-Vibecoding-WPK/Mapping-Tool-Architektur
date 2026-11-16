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
  strassenraum: "#e9e9e7",
  verkehrsflaeche: "#efefed",
  park: "#cfdcc4",
  wald: "#a9c29b",
  wiese: "#e2eadb",
  wasser: "#cdd9e0",
  wasserLinie: "#9fb4c1",
  baum: "#5b7f4f",
  akzent: "#e2482d"
};

// Welche Ebenen gehören zu welchem Plan?
const PLAN_EBENEN = {
  schwarzplan: ["gebaeude-haupt", "gebaeude-neben", "rahmen"],
  strassen: ["gebaeude-hell", "verkehrsflaechen", "bahn-flaeche", "bahn","strasse-fuss", "strasse-wohn", "strasse-neben", "strasse-haupt", "rahmen"],
  gruen: ["gebaeude-hell", "gruen-wiese", "gruen-park", "gruen-wald", "wasser", "wasser-linien", "baeume", "rahmen"],
  lageplan: ["gruen-wiese", "gruen-park", "gruen-wald", "wasser", "wasser-linien", "verkehrsflaechen", "strassenraum",
    "bahn-flaeche", "bahn","baeume", "gebaeude-haupt", "gebaeude-neben", "rahmen"]
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
let planLegenden = {};

// Linienbreite, die beim Zoomen mitwächst (Wert in Pixeln bei Zoomstufe 16)
const mitZoom = (px16) => ["interpolate", ["exponential", 1.6], ["zoom"], 12, px16 * 0.15, 16, px16, 20, px16 * 6];

// Breite in echten Metern (z. B. Straßenraum 10 m), umgerechnet in Pixel je Zoomstufe
function inMetern(meterAusdruck, breitengrad) {
  const proPixelBeiZoom0 = 40075016.686 * Math.cos(breitengrad * Math.PI / 180) / 512;
  return ["interpolate", ["exponential", 2], ["zoom"],
    0, ["/", meterAusdruck, proPixelBeiZoom0],
    24, ["/", ["*", meterAusdruck, 2 ** 24], proPixelBeiZoom0]];
}

function erstellePlanKarte(bbox) {
  planKarte = new maplibregl.Map({
    container: "plan",
    bounds: bbox,
    fitBoundsOptions: { padding: 40 },
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    style: { version: 8, sources: {}, layers: [{ id: "papier", type: "background", paint: { "background-color": "#ffffff" } }] }
  });
  planKarte.touchZoomRotate.disableRotation();
  planKarte.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  planKarte.addControl(new maplibregl.ScaleControl({ maxWidth: 160, unit: "metric" }), "bottom-left");
  planKarte.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
  return new Promise((ok) => planKarte.on("load", ok));
}

const leereSammlung = { type: "FeatureCollection", features: [] };

function ebenenAnlegen(breitengrad) {
  const k = planKarte;
  const quelle = "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap-Mitwirkende</a> (ODbL)";
  for (const name of ["gebaeude", "strassen", "bahn", "gruen", "wasserLinien", "baeume", "verkehrsflaechen", "rahmen"]) {
    const optionen = { type: "geojson", data: leereSammlung };
    if (name === "gebaeude") optionen.attribution = quelle; // Quellenangabe einmal unten rechts
    k.addSource(name, optionen);
  }
  const filterKat = (kat) => ["==", ["get", "kategorie"], kat];
  const ebenen = [
    // Grün und Wasser (Flächen)
    { id: "gruen-wiese", type: "fill", source: "gruen", filter: filterKat("wiese"), paint: { "fill-color": PLAN_FARBEN.wiese } },
    { id: "gruen-park", type: "fill", source: "gruen", filter: filterKat("park"), paint: { "fill-color": PLAN_FARBEN.park } },
    { id: "gruen-wald", type: "fill", source: "gruen", filter: filterKat("wald"), paint: { "fill-color": PLAN_FARBEN.wald } },
    { id: "wasser", type: "fill", source: "gruen", filter: filterKat("wasser"), paint: { "fill-color": PLAN_FARBEN.wasser } },
    { id: "wasser-linien", type: "line", source: "wasserLinien",
      paint: { "line-color": PLAN_FARBEN.wasserLinie, "line-width": inMetern(["get", "breite"], breitengrad) },
      layout: { "line-cap": "round", "line-join": "round" } },
    // Verkehrsflächen und Straßenraum (Lageplan)
    { id: "verkehrsflaechen", type: "fill", source: "verkehrsflaechen", paint: { "fill-color": PLAN_FARBEN.verkehrsflaeche, "fill-outline-color": "#d6d6d4" } },
    { id: "strassenraum", type: "line", source: "strassen",
      paint: { "line-color": PLAN_FARBEN.strassenraum, "line-width": inMetern(["*", ["get", "breite"], 0.8], breitengrad) },
      layout: { "line-cap": "round", "line-join": "round" } },
    // Gebäude hellgrau als Orientierung (Straßennetz, Grün)
    { id: "gebaeude-hell", type: "fill", source: "gebaeude", paint: { "fill-color": PLAN_FARBEN.gebaeudeHell } },
    // Bahn: gestrichelte Linie
    { id: "bahn-flaeche", type: "fill", source: "bahn", filter: ["==", ["get", "art"], "bahnflaeche"],
      paint: { "fill-color": PLAN_FARBEN.verkehrsflaeche } },
    { id: "bahn", type: "line", source: "bahn", filter: ["!=", ["get", "art"], "bahnflaeche"],
      paint: { "line-color": "#555555", "line-width": mitZoom(1.6), "line-dasharray": [4, 2] } },
    // Straßen nach Kategorie, unterschieden über die Linienstärke
    { id: "strasse-fuss", type: "line", source: "strassen", filter: filterKat("fuss"),
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": mitZoom(0.6), "line-opacity": 0.8 } },
    { id: "strasse-wohn", type: "line", source: "strassen", filter: filterKat("wohn"),
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": mitZoom(1.5) }, layout: { "line-cap": "round", "line-join": "round" } },
    { id: "strasse-neben", type: "line", source: "strassen", filter: filterKat("neben"),
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": mitZoom(2.8) }, layout: { "line-cap": "round", "line-join": "round" } },
    { id: "strasse-haupt", type: "line", source: "strassen", filter: filterKat("haupt"),
      paint: { "line-color": PLAN_FARBEN.schwarz, "line-width": mitZoom(4.5) }, layout: { "line-cap": "round", "line-join": "round" } },
    // Einzelbäume als Kreis in Kronengröße
    { id: "baeume", type: "circle", source: "baeume",
      paint: { "circle-radius": inMetern(["get", "kronenradius"], breitengrad), "circle-color": PLAN_FARBEN.baum,
        "circle-opacity": 0.25, "circle-stroke-color": PLAN_FARBEN.baum, "circle-stroke-width": 0.6 } },
    // Gebäude
    { id: "gebaeude-haupt", type: "fill", source: "gebaeude", filter: ["==", ["get", "art"], "haupt"], paint: { "fill-color": PLAN_FARBEN.schwarz } },
    { id: "gebaeude-neben", type: "fill", source: "gebaeude", filter: ["==", ["get", "art"], "neben"], paint: { "fill-color": PLAN_FARBEN.neben } },
    // Rahmen des Untersuchungsgebiets
    { id: "rahmen", type: "line", source: "rahmen", paint: { "line-color": PLAN_FARBEN.akzent, "line-width": 1.2, "line-dasharray": [4, 3] } }
  ];
  for (const e of ebenen) k.addLayer({ ...e, layout: { ...(e.layout || {}), visibility: "none" } });
}

// Legenden-Einträge pro Plan: [Art des Zeichens, Farbe/Stärke, Text]
function legendeFuer(plan, k) {
  const m = (wert) => `${fmt(wert)} m`;
  const kat = (key) => `${STRASSEN_KATEGORIEN[key]} · ${m(k.strassen[key])}`;
  switch (plan) {
    case "schwarzplan": return [
      ["flaeche", PLAN_FARBEN.schwarz, `Gebäude (${fmt(k.gebaeudeAnzahl)})`],
      ["flaeche", PLAN_FARBEN.neben, `Nebengebäude, Überdachungen (${fmt(k.nebenAnzahl)})`, "neben"]
    ];
    case "strassen": return [
      ["linie", 4.5, kat("haupt")],
      ["linie", 2.8, kat("neben")],
      ["linie", 1.5, kat("wohn")],
      ["linie", 0.6, kat("fuss")],
      ["strich", "#555555", "Bahn"],
      ["flaeche", PLAN_FARBEN.verkehrsflaeche, "Platz, Parkplatz"]
    ];
    case "gruen": return [
      ["flaeche", PLAN_FARBEN.park, GRUEN_KATEGORIEN.park],
      ["flaeche", PLAN_FARBEN.wald, GRUEN_KATEGORIEN.wald],
      ["flaeche", PLAN_FARBEN.wiese, GRUEN_KATEGORIEN.wiese],
      ["flaeche", PLAN_FARBEN.wasser, GRUEN_KATEGORIEN.wasser],
      ["kreis", PLAN_FARBEN.baum, `Einzelbaum (${fmt(k.baeume)})`]
    ];
    case "lageplan": return [
      ["flaeche", PLAN_FARBEN.schwarz, "Gebäude"],
      ["flaeche", PLAN_FARBEN.neben, "Nebengebäude, Überdachungen", "neben"],
      ["flaeche", PLAN_FARBEN.strassenraum, "Straßenraum, Platz"],
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
      e[3] === "neben" ? `<label class="schalter"><input type="checkbox" id="neben-schalter" ${nebenSichtbar ? "checked" : ""}> zeigen</label>` : ""
    }</li>`).join("")}</ul>
    <p class="legende-quelle">${document.getElementById("plan").dataset.quelle || ""}</p>`;
  const schalter = document.getElementById("neben-schalter");
  if (schalter) schalter.addEventListener("change", () => { nebenSichtbar = schalter.checked; zeigePlan(aktuellerPlan); });
}

// Einen Plan zeigen: passende Ebenen ein-, alle anderen ausblenden
function zeigePlan(plan) {
  aktuellerPlan = plan;
  if (!planKarte) return;
  planKarte.resize();
  const sichtbar = new Set(PLAN_EBENEN[plan]);
  if (!nebenSichtbar) sichtbar.delete("gebaeude-neben");
  for (const ebene of planKarte.getStyle().layers) {
    if (ebene.id === "papier") continue;
    planKarte.setLayoutProperty(ebene.id, "visibility", sichtbar.has(ebene.id) ? "visible" : "none");
  }
  zeigeLegende();
}

// Nach der Analyse: Daten in die Planansicht übernehmen
async function zeichnePlaene(daten, bbox, kennzahlen, quelleText) {
  const breitengrad = (bbox[1] + bbox[3]) / 2;
  document.getElementById("plan").dataset.quelle = quelleText;
  document.getElementById("plan-leer").hidden = true;
  if (!planKarte) {
    await erstellePlanKarte(bbox);
    ebenenAnlegen(breitengrad);
  } else {
    planKarte.fitBounds(bbox, { padding: 40, duration: 0 });
  }
  planKarte.setMaxBounds(null);
  for (const name of ["gebaeude", "strassen", "bahn", "gruen", "wasserLinien", "baeume", "verkehrsflaechen"]) {
    planKarte.getSource(name).setData(daten[name]);
  }
  planKarte.getSource("rahmen").setData(turf.bboxPolygon(bbox));
  for (const plan of Object.keys(PLAN_EBENEN)) planLegenden[plan] = legendeFuer(plan, kennzahlen);
  zeigePlan(aktuellerPlan);
}
