/* ============================================================
   SiteKick – Erreichbarkeit zu Fuß (im Reiter "Umgebung")

   Man wählt einen Mittelpunkt (Klick auf die Karte) und bekommt Kreise für 5, 10 und 15 Minuten Gehzeit.
   Rechnung: Luftlinie, 80 Meter je Minute (4,8 km/h). Das ist eine Annahme und KEIN Wegenetz: Umwege, Gebäude, Bahnlinien und
   Gewässer zählen nicht. Echte Fußwege sind deutlich kürzer erreichbar als die Kreise zeigen.
   ============================================================ */

"use strict";

const ERREICH_M_PRO_MIN = 80;
const ERREICH_FARBE = "#F2541B";
let erreichMitte = null;            // [Länge, Breite] oder null
let erreichWaehlt = false;          // wartet auf den Klick für den Mittelpunkt
const erreichEl = {
  an: document.getElementById("er-an"), waehlen: document.getElementById("er-waehlen"), loeschen: document.getElementById("er-loeschen"),
  r5: document.getElementById("er-5"), r10: document.getElementById("er-10"), r15: document.getElementById("er-15"), text: document.getElementById("er-text")
};

function erreichRadien() {
  return [[5, erreichEl.r5], [10, erreichEl.r10], [15, erreichEl.r15]].filter(([, el]) => el.checked).map(([min]) => min);
}

// Ringe als Linien (Länge/Breite) für Karte und Export
function erreichRinge() {
  if (!erreichMitte) return [];
  return erreichRadien().map((min) => {
    const kreis = turf.circle(erreichMitte, (min * ERREICH_M_PRO_MIN) / 1000, { steps: 128, units: "kilometers" });
    return { type: "Feature", properties: { min, meter: min * ERREICH_M_PRO_MIN }, geometry: { type: "LineString", coordinates: kreis.geometry.coordinates[0] } };
  });
}

function legeErreichEbenenAn() {
  map.addSource("erreich", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "erreich-linie", type: "line", source: "erreich", layout: { visibility: "none" }, filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": ERREICH_FARBE, "line-width": 2, "line-dasharray": [3, 2] } }, "gebiet-flaeche");
  map.addLayer({ id: "erreich-mitte", type: "circle", source: "erreich", layout: { visibility: "none" }, filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 6, "circle-color": ERREICH_FARBE, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } }, "gebiet-flaeche");
}

function aktualisiereErreich() {
  const imReiter = aktuelleAnsicht === "infos" && datenVorhanden;
  if (!kartenBereit || !map.getSource("erreich")) return;
  const zeigen = imReiter && erreichEl.an.checked && !!erreichMitte;
  const features = zeigen ? [...erreichRinge(), { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: erreichMitte } }] : [];
  map.getSource("erreich").setData({ type: "FeatureCollection", features });
  for (const id of ["erreich-linie", "erreich-mitte"]) map.setLayoutProperty(id, "visibility", zeigen ? "visible" : "none");
  erreichEl.waehlen.textContent = erreichWaehlt ? "Jetzt auf die Karte klicken …" : erreichMitte ? "Anderen Mittelpunkt wählen" : "Mittelpunkt wählen";
  erreichEl.loeschen.hidden = !erreichMitte;
  erreichEl.text.textContent = erreichMitte
    ? erreichRadien().map((min) => `${min} min = ${zahl(min * ERREICH_M_PRO_MIN)} m`).join(" · ") + " (Luftlinie, 4,8 km/h)"
    : "Kreise für 5, 10 und 15 Minuten Gehzeit um einen Punkt (Luftlinie, keine echten Wege).";
  map.getCanvas().style.cursor = erreichWaehlt ? "crosshair" : "";
}

erreichEl.waehlen.addEventListener("click", () => { erreichEl.an.checked = true; erreichWaehlt = !erreichWaehlt; aktualisiereErreich(); });
erreichEl.loeschen.addEventListener("click", () => { erreichMitte = null; erreichWaehlt = false; aktualisiereErreich(); });
[erreichEl.an, erreichEl.r5, erreichEl.r10, erreichEl.r15].forEach((el) => el.addEventListener("change", aktualisiereErreich));
map.on("click", (e) => {
  if (!erreichWaehlt || aktuelleAnsicht !== "infos") return;
  erreichMitte = [e.lngLat.lng, e.lngLat.lat];
  erreichWaehlt = false;
  erreichEl.an.checked = true;
  aktualisiereErreich();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && erreichWaehlt) { erreichWaehlt = false; aktualisiereErreich(); } });
function verwerfeErreich() { erreichMitte = null; erreichWaehlt = false; }
