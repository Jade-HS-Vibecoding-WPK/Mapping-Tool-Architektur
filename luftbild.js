/* ============================================================
   SiteKick – Luftbild (Reiter "Luftbild")

   Das LGLN (Landesvermessung Niedersachsen) stellt die Digitalen Orthophotos (DOP20) frei bereit: entzerrte Luftbilder
   (Flugzeugaufnahmen, keine Satellitenbilder) mit 20 cm Bodenauflösung, Lizenz CC BY 4.0. Wir binden sie als Kartendienst
   (WMS) ein; die Karte lädt nur die Bildkacheln, die gerade im Fenster sichtbar sind.

   Über dem Luftbild lassen sich Linien einblenden: Gebäudeumrisse (OpenStreetMap), Flurstücksgrenzen und amtliche
   Straßenflächen (beide LGLN). Sie erscheinen, sobald "Analysieren" die Daten geholt hat. Das Luftbild selbst braucht
   keine Analyse, es erscheint sofort, sobald man den Reiter öffnet.

   Gilt nur für Niedersachsen (und das angrenzende Bremen). Außerhalb zeigt der Reiter einen Hinweis.
   ============================================================ */

"use strict";

const DOP_WMS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms";
const NI_RAHMEN = [6.6, 51.2, 11.65, 53.95];   // grobe Umgebung von Niedersachsen (West, Süd, Ost, Nord)
const luftFeld = document.getElementById("luft-info");
const luftEl = {
  deckkraft: document.getElementById("luft-deckkraft"),
  deckkraftWert: document.getElementById("luft-deckkraft-wert"),
  sw: document.getElementById("luft-sw"),
  gebaeude: document.getElementById("luft-gebaeude"),
  flst: document.getElementById("luft-flst"),
  strassen: document.getElementById("luft-strassen"),
  hinweis: document.getElementById("luft-hinweis")
};
const luftJahr = new Date().getFullYear();   // Quellenvermerk verlangt das Jahr des Datenbezugs

// Wird einmal beim Start der Karte aufgerufen (siehe app.js, map.on("load"))
function legeLuftbildEbenenAn() {
  map.addSource("luftbild", {
    type: "raster", tileSize: 256, maxzoom: 20, bounds: NI_RAHMEN,
    tiles: [`${DOP_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ni_dop20&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg`],
    attribution: `Luftbild: LGLN (${luftJahr}), CC BY 4.0`
  });
  // Das Luftbild liegt unter allen Plan-Ebenen, die Linien darüber (aber unter dem Rechteck)
  map.addLayer({ id: "luftbild", type: "raster", source: "luftbild", layout: { visibility: "none" } }, "flst-flaeche");
  const unsichtbar = { visibility: "none" };
  map.addLayer({ id: "luft-strassen", type: "line", source: "alkis-flaechen", layout: unsichtbar,
    filter: ["in", ["get", "kat"], ["literal", ["strasse", "weg", "platz"]]], paint: { "line-color": "#ff9ec0", "line-width": 1 } }, "gebiet-flaeche");
  map.addLayer({ id: "luft-flst", type: "line", source: "flurstuecke", layout: unsichtbar,
    paint: { "line-color": "#5fd4ff", "line-width": 1, "line-dasharray": [3, 1.5] } }, "gebiet-flaeche");
  map.addLayer({ id: "luft-gebaeude", type: "line", source: "osm-daten", layout: unsichtbar,
    filter: istKat("gebaeude", "nebengebaeude"), paint: { "line-color": "#ffd43b", "line-width": 1.3 } }, "gebiet-flaeche");
}

// Wird bei jedem Reiterwechsel und jedem Datenstand aufgerufen (siehe wendeAnsichtAn)
function aktualisiereLuftbild() {
  const aktiv = aktuelleAnsicht === "luftbild";
  luftFeld.hidden = !aktiv;
  if (!kartenBereit) return;
  const an = (b) => (b ? "visible" : "none");

  map.setLayoutProperty("luftbild", "visibility", an(aktiv));
  map.setPaintProperty("luftbild", "raster-opacity", Number(luftEl.deckkraft.value));
  map.setPaintProperty("luftbild", "raster-saturation", luftEl.sw.checked ? -1 : 0);
  map.setLayoutProperty("luft-gebaeude", "visibility", an(aktiv && luftEl.gebaeude.checked && osmFeatures.length > 0));
  map.setLayoutProperty("luft-flst", "visibility", an(aktiv && luftEl.flst.checked && flurstueckeVorhanden));
  map.setLayoutProperty("luft-strassen", "visibility", an(aktiv && luftEl.strassen.checked && alkisVorhanden));
  if (!aktiv) return;

  // Schalter nur anbieten, wenn es die Daten gibt
  const verfuegbar = { gebaeude: osmFeatures.length > 0, flst: flurstueckeVorhanden, strassen: alkisVorhanden };
  for (const k of Object.keys(verfuegbar)) {
    luftEl[k].disabled = !verfuegbar[k];
    luftEl[k].closest("label").classList.toggle("ist-aus", !verfuegbar[k]);
  }
  let hinweis = "";
  if (gebiet) {
    const [west, sued, ost, nord] = turf.bbox(gebiet);
    const mx = (west + ost) / 2, my = (sued + nord) / 2;
    if (mx < NI_RAHMEN[0] || mx > NI_RAHMEN[2] || my < NI_RAHMEN[1] || my > NI_RAHMEN[3]) {
      hinweis = "Für dieses Gebiet gibt es kein Luftbild: Der Dienst deckt nur Niedersachsen ab.";
    } else if (!datenVorhanden) {
      hinweis = "Die Linien (Gebäude, Flurstücke, Straßen) erscheinen, sobald du links auf „Analysieren“ geklickt hast.";
    }
  } else {
    hinweis = "Noch kein Gebiet gewählt. Das Luftbild gilt für das, was du gerade auf der Karte siehst; ein Rechteck legst du im Reiter „Karte“ fest.";
  }
  luftEl.hinweis.textContent = hinweis;
  luftEl.hinweis.hidden = !hinweis;
}

luftEl.deckkraft.addEventListener("input", () => {
  luftEl.deckkraftWert.textContent = `${Math.round(luftEl.deckkraft.value * 100)} %`;
  if (kartenBereit) map.setPaintProperty("luftbild", "raster-opacity", Number(luftEl.deckkraft.value));
});
[luftEl.sw, luftEl.gebaeude, luftEl.flst, luftEl.strassen].forEach((e) => e.addEventListener("change", aktualisiereLuftbild));
