/* ============================================================
   SiteKick – Schwarzplan nach Gebäudehöhe (Schalter im Reiter "Schwarzplan")

   Zwei Darstellungen: "Schwarz" (wie bisher) und "Nach Höhe" (fünf Grautöne von hell = niedrig bis schwarz = hoch).
   Höhe je Gebäude: LoD2 (gemessene Gebäudehöhe), sonst OSM-Höhe, sonst Geschosszahl mal 3 m, sonst eine Annahme.
   Die Höhen sind je nach Quelle unterschiedlich genau (LoD2 gut, OSM-Geschosse und Annahmen grob).
   ============================================================ */

"use strict";

const HOEHEN_KLASSEN = [
  { bis: 6, farbe: "#e4e4e4", name: "bis 6 m", kurz: "00_06" },
  { bis: 12, farbe: "#b5b5b5", name: "6 bis 12 m", kurz: "06_12" },
  { bis: 18, farbe: "#7d7d7d", name: "12 bis 18 m", kurz: "12_18" },
  { bis: 25, farbe: "#454545", name: "18 bis 25 m", kurz: "18_25" },
  { bis: Infinity, farbe: "#000000", name: "über 25 m", kurz: "25_PLUS" }
];
let schwarzModus = "schwarz";          // "schwarz" oder "hoehe"
let hoehenGesetzt = "";                // für welchen Datenstand "hh" an den OSM-Objekten steht

const hoehenBalken = document.getElementById("schwarz-modus");

// Gebäudehöhe in Metern aus den Eigenschaften eines OSM-Gebäudes
function gebaeudeHoehe(p) {
  if (p.trauf != null && p.boden != null && p.hoehe > 0 && p.hoehe >= p.trauf - p.boden) return p.hoehe;   // LoD2: Firsthöhe
  if (p.hoehe > 0) return p.hoehe;
  if (p.ebenen) return p.ebenen * GESCHOSSHOEHE_M;
  return GESCHOSSE_ERSATZ * GESCHOSSHOEHE_M;
}
const hoehenKlasse = (h) => HOEHEN_KLASSEN.find((k) => h < k.bis) || HOEHEN_KLASSEN[HOEHEN_KLASSEN.length - 1];

// Schreibt die Höhe als Eigenschaft "hh" an alle OSM-Objekte und gibt sie neu an die Karte (einmal je Datenstand)
function setzeHoehenEigenschaft() {
  const stand = `${osmFeatures.length}|${lod2Gebaeude.length}`;
  if (hoehenGesetzt === stand) return;
  for (const f of osmFeatures) if (f.properties.kat === "gebaeude" || f.properties.kat === "nebengebaeude") f.properties.hh = gebaeudeHoehe(f.properties);
  map.getSource("osm-daten").setData({ type: "FeatureCollection", features: osmFeatures });
  hoehenGesetzt = stand;
}

// Wird bei jedem Reiterwechsel und jedem Datenstand aufgerufen (am Ende von wendeAnsichtAn)
function aktualisiereHoehe() {
  const aktiv = aktuelleAnsicht === "schwarzplan" && datenVorhanden;
  hoehenBalken.hidden = !aktiv;
  if (!aktiv || !kartenBereit) return;
  hoehenBalken.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.modus === schwarzModus));
  if (schwarzModus !== "hoehe") return;
  setzeHoehenEigenschaft();
  const stufen = HOEHEN_KLASSEN.slice(1).flatMap((k, i) => [HOEHEN_KLASSEN[i].bis, k.farbe]);
  map.setPaintProperty("gebaeude-flaeche", "fill-color", ["case", ["==", ["get", "kat"], "nebengebaeude"], "#c9c9c9",
    ["step", ["coalesce", ["get", "hh"], 0], HOEHEN_KLASSEN[0].farbe, ...stufen]]);
  map.setPaintProperty("gebaeude-flaeche", "fill-outline-color", "#6a6a6a");
}

hoehenBalken.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  schwarzModus = b.dataset.modus;
  wendeAnsichtAn();
});

function verwerfeHoehe() { hoehenGesetzt = ""; }

// Legende
function hoehenLegendeEintraege() {
  return HOEHEN_KLASSEN.map((k) => eintrag(farbfeld(k.farbe, "#666"), `Gebäude ${k.name}`)).join("");
}
