/* ============================================================
   SiteKick – Infos (Reiter "Infos")

   Zeigt Orte und Linien aus OpenStreetMap, die man für eine Ortsanalyse braucht: Kindergärten, Schulen, Spielplätze,
   Läden, Haltestellen, Bahnhöfe, Bahnstrecken, Ärzte, Gastronomie und mehr. Jede Gruppe lässt sich einzeln ein- und
   ausschalten (Kästchen im Infofeld). Ein Klick auf einen Punkt zeigt Name, Adresse und Öffnungszeiten, soweit eingetragen.

   Ablauf: Nachdem die Hauptabfrage von OpenStreetMap fertig ist, schickt dieses Modul eine zweite Abfrage nur für diese
   Orte. So bremsen sich die beiden Abfragen nicht aus. Es gilt nur das gewählte Rechteck (Orte direkt außerhalb fehlen).

   Ehrlich bleiben: OpenStreetMap wird von Freiwilligen gepflegt. Die Karte ist vollständig, wo viele mitmachen, aber nicht
   garantiert vollständig oder aktuell. Öffnungszeiten und Namen fehlen oft.
   ============================================================ */

"use strict";

const INFO_BEREICHE = {
  bildung:     { name: "Kinder und Bildung", farbe: "#e07b24" },
  einkauf:     { name: "Einkaufen", farbe: "#2f6fb5" },
  verkehr:     { name: "Verkehr", farbe: "#7a4aa8" },
  gesundheit:  { name: "Gesundheit", farbe: "#c8362e" },
  freizeit:    { name: "Essen, Kultur, Freizeit", farbe: "#17877a" },
  oeffentlich: { name: "Öffentliche Einrichtungen", farbe: "#6b6b6b" }
};

// Jede Gruppe: Kennung, Bereich, Name, Kürzel im Kreis, ob sie am Anfang an ist, und welche OSM-Merkmale dazugehören.
// "spec" = Liste von [Merkmal, erlaubte Werte]; Werte null heißt "irgendein Wert". Die erste passende Gruppe gewinnt.
const grp = (id, bereich, name, kurz, an, spec, extra = {}) => ({ id, bereich, name, kurz, an, spec, ...extra });
const INFO_GRUPPEN = [
  grp("kita", "bildung", "Kindergärten und Kitas", "K", true, [["amenity", ["kindergarten", "childcare"]]]),
  grp("schule", "bildung", "Schulen", "S", true, [["amenity", ["school"]]]),
  grp("hochschule", "bildung", "Hochschulen", "H", false, [["amenity", ["university", "college"]]]),
  grp("spielplatz", "bildung", "Spielplätze", "Sp", true, [["leisure", ["playground"]]]),

  grp("lebensmittel", "einkauf", "Lebensmittel (Supermarkt, Bäcker …)", "L", true,
    [["shop", ["supermarket", "convenience", "greengrocer", "bakery", "butcher", "deli", "beverages", "organic"]]]),
  grp("zentrum", "einkauf", "Einkaufszentren, Kaufhäuser", "E", true, [["shop", ["mall", "department_store"]]]),
  grp("geschaeft", "einkauf", "Weitere Geschäfte", "Ge", false, [["shop", null]]),

  grp("bus", "verkehr", "Bushaltestellen", "B", true, [["highway", ["bus_stop"]]]),
  grp("tram", "verkehr", "Straßenbahnhaltestellen", "T", true, [["railway", ["tram_stop"]]]),
  grp("bahnhof", "verkehr", "Bahnhöfe und Haltepunkte", "Bf", true, [["railway", ["station", "halt"]]]),
  grp("bahnstrecke", "verkehr", "Bahnstrecken", "", true, [["railway", ["rail"]]], { linie: true, farbe: "#3a3a3a" }),
  grp("tramstrecke", "verkehr", "Straßenbahn- und Stadtbahngleise", "", true, [["railway", ["tram", "light_rail", "subway"]]], { linie: true, farbe: "#7a4aa8" }),
  grp("fahrrad", "verkehr", "Fahrradverleih", "R", false, [["amenity", ["bicycle_rental"]]]),
  grp("fahrradpark", "verkehr", "Fahrradabstellanlagen", "Fa", false, [["amenity", ["bicycle_parking"]]]),
  grp("parken", "verkehr", "Parkplätze und Parkhäuser", "P", false, [["amenity", ["parking"]]]),
  grp("laden", "verkehr", "Ladesäulen für E-Autos", "Ls", false, [["amenity", ["charging_station"]]]),
  grp("carsharing", "verkehr", "Carsharing", "Cs", false, [["amenity", ["car_sharing"]]]),

  grp("arzt", "gesundheit", "Ärzte und Kliniken", "Ä", false, [["amenity", ["doctors", "dentist", "clinic"]]]),
  grp("apotheke", "gesundheit", "Apotheken", "A", false, [["amenity", ["pharmacy"]]]),
  grp("krankenhaus", "gesundheit", "Krankenhäuser", "KH", false, [["amenity", ["hospital"]]]),

  grp("gastro", "freizeit", "Gastronomie", "Gs", false, [["amenity", ["restaurant", "cafe", "fast_food", "bar", "pub", "biergarten", "ice_cream"]]]),
  grp("kultur", "freizeit", "Kultur (Theater, Kino, Museum, Bibliothek)", "Ku", false,
    [["amenity", ["theatre", "cinema", "arts_centre", "library", "community_centre"]], ["tourism", ["museum", "gallery", "attraction"]]]),
  grp("sport", "freizeit", "Sport und Schwimmbäder", "Sy", false, [["leisure", ["sports_centre", "fitness_centre", "swimming_pool", "stadium"]]]),
  grp("kirche", "freizeit", "Kirchen und Religion", "Ki", false, [["amenity", ["place_of_worship"]]]),

  grp("amt", "oeffentlich", "Ämter, Polizei, Feuerwehr, Post", "Am", false,
    [["amenity", ["townhall", "police", "fire_station", "post_office", "courthouse"]]]),
  grp("toilette", "oeffentlich", "Öffentliche Toiletten", "WC", false, [["amenity", ["toilets"]]]),
  // Denkmal: alles mit dem OSM-Merkmal "heritage". Steht zuletzt; Orte, die auch in eine andere Gruppe passen (z. B. Kirchen), kommen zusätzlich hierher (siehe leseInfos).
  grp("denkmal", "oeffentlich", "Denkmal (OSM, unvollständig)", "D", false, [["heritage", null]], { farbe: "#8c5a2b" })
];
const infoGruppe = Object.fromEntries(INFO_GRUPPEN.map((x) => [x.id, x]));
const farbeVon = (x) => x.farbe || INFO_BEREICHE[x.bereich].farbe;

const infoPanel = document.getElementById("info-panel");
const infoStatus = document.getElementById("info-status");
let infoFeatures = [];              // alle geladenen Orte und Linien (GeoJSON)
let infoVorhanden = false;
let infoZaehler = {};               // Anzahl je Gruppe
let infoAn = new Set(INFO_GRUPPEN.filter((x) => x.an).map((x) => x.id));
try {
  const gemerkt = JSON.parse(localStorage.getItem("ortsanalyse-infos") || "null");
  if (Array.isArray(gemerkt)) infoAn = new Set(gemerkt.filter((id) => infoGruppe[id]));
} catch (_) { /* ohne Speicher: Standard gilt */ }
let infoPopup = null;

// ---------- 1. Abfrage ----------
function infosAbfrage(sued, west, nord, ost) {
  const b = [sued, west, nord, ost].map((z) => z.toFixed(6)).join(",");
  const filter = (k, w) => `["${k}"${w ? `~"^(${w.join("|")})$"` : ""}]`;
  const punkte = new Set(), linien = new Set();
  for (const gr of INFO_GRUPPEN) for (const [k, w] of gr.spec) {
    if (gr.linie) linien.add(`  way${filter(k, w)}["service"!~"."](${b});`);
    else punkte.add(`  nwr${filter(k, w)}(${b});`);
  }
  return `[out:json][timeout:60];\n(\n${[...punkte].join("\n")}\n);\nout center tags qt;\n(\n${[...linien].join("\n")}\n);\nout geom qt;`;
}

// Wie holeOsmDaten (app.js): alle Server gleichzeitig fragen, der erste Treffer gewinnt
async function holeInfosDaten(abfrage) {
  const stopp = new AbortController();
  const fehlerListe = [];
  const versuche = OVERPASS_SERVER.map((url) => {
    const host = new URL(url).host;
    ladeUnter("infos", host, host, "laedt", null, "fragt …");
    return frageServer(url, abfrage, stopp.signal)
      .then((daten) => { ladeUnter("infos", host, host, "fertig", 1, "Antwort erhalten"); return daten; })
      .catch((fehler) => {
        fehlerListe.push(fehler);
        if (stopp.signal.aborted) ladeUnter("infos", host, host, "abgebrochen", 1, "nicht mehr nötig");
        else ladeUnter("infos", host, host, "fehler", 1, String(fehler.message).slice(0, 30));
        throw fehler;
      });
  });
  try {
    const daten = await Promise.any(versuche);
    stopp.abort();
    return daten;
  } catch (_) {
    throw new Error(fehlerListe[0]?.message || "OpenStreetMap antwortet gerade nicht");
  }
}

const passt = (gr, t) => gr.spec.some(([k, w]) => (w ? w.includes(t[k]) : t[k] != null));

function adresse(t) {
  const strasse = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  return [strasse, [t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

// Liefert { features, zaehler }; Orte außerhalb des Rechtecks und doppelte Einträge fallen weg
function leseInfos(daten, bbox) {
  const [west, sued, ost, nord] = bbox;
  const features = [], zaehler = {}, gesehen = new Set();
  for (const el of daten.elements || []) {
    const t = el.tags || {};
    const schluessel = `${el.type}${el.id}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    if (el.geometry) {                                   // Linie (Bahn, Tram)
      const gr = INFO_GRUPPEN.find((x) => x.linie && passt(x, t));
      if (!gr || el.geometry.length < 2) continue;
      let linie = turf.lineString(el.geometry.map((p) => [p.lon, p.lat]));
      try { linie = turf.bboxClip(linie, bbox); } catch (_) { continue; }
      if (!linie.geometry.coordinates.length) continue;
      features.push({ type: "Feature", geometry: linie.geometry, properties: { g: gr.id, name: t.name || "" } });
      zaehler[gr.id] = (zaehler[gr.id] || 0) + 1;
      continue;
    }
    const gr = INFO_GRUPPEN.find((x) => !x.linie && passt(x, t));
    const lat = el.lat ?? (el.center && el.center.lat), lon = el.lon ?? (el.center && el.center.lon);
    if (!gr || lat == null || lon == null || lon < west || lon > ost || lat < sued || lat > nord) continue;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {
      g: gr.id, name: t.name || "", adr: adresse(t), zeiten: t.opening_hours || "",
      art: t[gr.spec[0][0]] || "", betreiber: t.operator || ""
    } });
    zaehler[gr.id] = (zaehler[gr.id] || 0) + 1;
    if (t.heritage && t.heritage !== "no" && gr.id !== "denkmal") {                    // Kirche, Museum usw. mit Denkmalstatus: zusätzlich als Denkmal zählen
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { g: "denkmal", name: t.name || "", adr: adresse(t), zeiten: "", art: t.heritage, betreiber: "" } });
      zaehler.denkmal = (zaehler.denkmal || 0) + 1;
    }
  }
  return { features, zaehler };
}

// Liefert { features, zaehler } oder { fehler } oder { abgebrochen }. Wirft nie.
async function starteInfos(rahmen, nummer) {
  try {
    zeigeInfoStatus("Orte werden bei OpenStreetMap geladen …");
    ladeSetze("infos", "laedt", null, "wird abgefragt …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const daten = await holeInfosDaten(infosAbfrage(sued, west, nord, ost));
    if (nummer !== ladeNummer) return { abgebrochen: true };
    return leseInfos(daten, [west, sued, ost, nord]);
  } catch (fehler) {
    return { fehler: fehler.message };
  }
}

function wendeInfosAn(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeInfoStatus(`Die Orte konnten nicht geladen werden (${ergebnis.fehler}). Bitte „Analysieren“ nochmal drücken.`);
    ladeSetze("infos", "fehler", 1, "nicht geladen");
    return;
  }
  infoFeatures = ergebnis.features;
  infoZaehler = ergebnis.zaehler;
  infoVorhanden = true;
  const punkte = infoFeatures.filter((f) => f.geometry.type === "Point").length;
  ladeSetze("infos", "fertig", 1, `${zahl(punkte)} Orte, ${zahl(infoFeatures.length - punkte)} Linien`);
  zeigeInfoStatus(`${zahl(punkte)} Orte und ${zahl(infoFeatures.length - punkte)} Bahn- und Gleisabschnitte im Gebiet gefunden. Daten © OpenStreetMap-Mitwirkende (ODbL), von Freiwilligen gepflegt, nicht garantiert vollständig.`);
  if (kartenBereit) map.getSource("infos").setData({ type: "FeatureCollection", features: infoFeatures });
  zeichneInfoZahlen();
  wendeAnsichtAn();
}

function verwerfeInfos() {
  infoFeatures = [];
  infoZaehler = {};
  infoVorhanden = false;
  if (infoPopup) { infoPopup.remove(); infoPopup = null; }
  zeigeInfoStatus("");
  if (typeof kartenBereit !== "undefined" && kartenBereit) map.getSource("infos").setData(leer);
  zeichneInfoZahlen();
}

// ---------- 2. Karte ----------
function infoIcon(kurz, farbe) {
  const s = 40, leinwand = document.createElement("canvas");
  leinwand.width = leinwand.height = s;
  const c = leinwand.getContext("2d");
  c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  c.fillStyle = farbe; c.fill();
  c.lineWidth = 3; c.strokeStyle = "#ffffff"; c.stroke();
  c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `bold ${kurz.length > 1 ? 16 : 20}px Helvetica, Arial, sans-serif`;
  c.fillText(kurz, s / 2, s / 2 + 1);
  return c.getImageData(0, 0, s, s);
}

// Wird einmal beim Start der Karte aufgerufen (siehe app.js, map.on("load"))
function legeInfoEbenenAn() {
  map.addSource("infos", { type: "geojson", data: leer });
  for (const gr of INFO_GRUPPEN) if (!gr.linie) map.addImage(`info-${gr.id}`, infoIcon(gr.kurz, farbeVon(gr)), { pixelRatio: 2 });
  const linie = (id, g2, paint, extra = {}) => map.addLayer({ id, type: "line", source: "infos", layout: { visibility: "none", ...extra },
    filter: ["==", ["get", "g"], g2], paint }, "gebiet-flaeche");
  // Bahnstrecke: dunkles Band mit hellen Querstrichen, wie auf Plänen üblich
  linie("info-bahn", "bahnstrecke", { "line-color": infoGruppe.bahnstrecke.farbe, "line-width": 4 });
  map.addLayer({ id: "info-bahn-strich", type: "line", source: "infos", layout: { visibility: "none" },
    filter: ["==", ["get", "g"], "bahnstrecke"], paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2] } }, "gebiet-flaeche");
  linie("info-tram", "tramstrecke", { "line-color": infoGruppe.tramstrecke.farbe, "line-width": 2.5 });
  map.addLayer({ id: "info-punkte", type: "symbol", source: "infos", layout: {
    visibility: "none", "icon-image": ["concat", "info-", ["get", "g"]], "icon-size": 0.85, "icon-allow-overlap": true, "icon-ignore-placement": true
  }, filter: ["==", ["geometry-type"], "Point"] }, "gebiet-flaeche");
}

function setzeInfoFilter() {
  if (!kartenBereit) return;
  const an = [...infoAn];
  const imReiter = aktuelleAnsicht === "infos";
  const sichtbar = (b) => (imReiter && b ? "visible" : "none");
  map.setFilter("info-punkte", ["all", ["==", ["geometry-type"], "Point"], ["in", ["get", "g"], ["literal", an]]]);
  map.setLayoutProperty("info-punkte", "visibility", sichtbar(true));
  for (const id of ["info-bahn", "info-bahn-strich"]) map.setLayoutProperty(id, "visibility", sichtbar(infoAn.has("bahnstrecke")));
  map.setLayoutProperty("info-tram", "visibility", sichtbar(infoAn.has("tramstrecke")));
}

// Wird bei jedem Reiterwechsel und jedem Datenstand aufgerufen (siehe wendeAnsichtAn)
function aktualisiereInfos() {
  const aktiv = aktuelleAnsicht === "infos";
  infoPanel.hidden = !aktiv;
  setzeInfoFilter();
  if (!aktiv) { if (infoPopup) { infoPopup.remove(); infoPopup = null; } return; }
  zeichneInfoStatus();
}

// ---------- 3. Infofeld mit Schaltern ----------
function baueInfoPanel() {
  const bereiche = Object.entries(INFO_BEREICHE).map(([bid, b]) => {
    const zeilen = INFO_GRUPPEN.filter((x) => x.bereich === bid).map((x) =>
      `<label class="info-zeile"><input type="checkbox" data-g="${x.id}"${infoAn.has(x.id) ? " checked" : ""}>` +
      (x.linie ? `<span class="info-marke info-linie" style="border-color:${farbeVon(x)}"></span>` : `<span class="info-marke" style="background:${farbeVon(x)}">${x.kurz}</span>`) +
      `<span class="info-name">${x.name}</span><span class="info-zahl" data-z="${x.id}">–</span></label>`).join("");
    // Die Überschrift hat einen eigenen Schalter: schaltet alle Gruppen des Bereichs auf einmal ein oder aus
    return `<h4 class="info-bereich" style="color:${b.farbe}"><label title="Alle Gruppen dieses Bereichs ein- oder ausschalten">` +
      `<input type="checkbox" data-bereich="${bid}"><span>${b.name}</span></label><span class="info-zahl" data-bz="${bid}">–</span></h4>${zeilen}`;
  }).join("");
  document.getElementById("info-gruppen").innerHTML = bereiche;
  aktualisiereBereichsSchalter();
}

// Stellt die Bereichsschalter passend zu den einzelnen Gruppen: an (alle an), aus (alle aus) oder halb (einige an)
function aktualisiereBereichsSchalter() {
  infoPanel.querySelectorAll("input[data-bereich]").forEach((feld) => {
    const gruppen = INFO_GRUPPEN.filter((x) => x.bereich === feld.dataset.bereich);
    const an = gruppen.filter((x) => infoAn.has(x.id)).length;
    feld.checked = an === gruppen.length;
    feld.indeterminate = an > 0 && an < gruppen.length;
  });
}

function zeichneInfoZahlen() {
  infoPanel.querySelectorAll("[data-z]").forEach((e) => {
    e.textContent = infoVorhanden ? zahl(infoZaehler[e.dataset.z] || 0) : "–";
  });
  // Summe je Bereich hinter der Überschrift
  infoPanel.querySelectorAll("[data-bz]").forEach((e) => {
    const summe = INFO_GRUPPEN.filter((x) => x.bereich === e.dataset.bz).reduce((s, x) => s + (infoZaehler[x.id] || 0), 0);
    e.textContent = infoVorhanden ? zahl(summe) : "–";
  });
}

let infoMeldung = "";
function zeigeInfoStatus(text) {
  infoMeldung = text;
  const seite = document.getElementById("info-status-seite");   // Hinweis in der Seitenleiste
  seite.textContent = text; seite.hidden = !text;
  zeichneInfoStatus();
}

// Text oben im Infofeld: die letzte Meldung, sonst ein Hinweis, was als Nächstes zu tun ist
function zeichneInfoStatus() {
  const text = infoMeldung || (infoVorhanden ? "" : datenVorhanden ? "Die Orte werden noch geladen …" : "Klicke links auf „Analysieren“. Danach erscheinen hier die Orte.");
  infoStatus.textContent = text;
  infoStatus.hidden = !text;
}

function speichereInfoAuswahl() {
  try { localStorage.setItem("ortsanalyse-infos", JSON.stringify([...infoAn])); } catch (_) { /* nicht schlimm */ }
}

infoPanel.addEventListener("change", (e) => {
  // Schalter einer Überschrift: alle Gruppen dieses Bereichs mitschalten
  const bereichFeld = e.target.closest("input[data-bereich]");
  if (bereichFeld) {
    for (const x of INFO_GRUPPEN.filter((y) => y.bereich === bereichFeld.dataset.bereich)) {
      if (bereichFeld.checked) infoAn.add(x.id); else infoAn.delete(x.id);
    }
    infoPanel.querySelectorAll("input[data-g]").forEach((f) => { f.checked = infoAn.has(f.dataset.g); });
    aktualisiereBereichsSchalter();
    speichereInfoAuswahl();
    setzeInfoFilter();
    if (typeof aktualisiereLegende === "function") aktualisiereLegende();
    return;
  }
  const feld = e.target.closest("input[data-g]");
  if (!feld) return;
  if (feld.checked) infoAn.add(feld.dataset.g); else infoAn.delete(feld.dataset.g);
  aktualisiereBereichsSchalter();
  speichereInfoAuswahl();
  setzeInfoFilter();
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
});

infoPanel.addEventListener("click", (e) => {
  const knopf = e.target.closest("button[data-aktion]");
  if (!knopf) return;
  const a = knopf.dataset.aktion;
  infoAn = new Set(a === "alle" ? INFO_GRUPPEN.map((x) => x.id) : a === "standard" ? INFO_GRUPPEN.filter((x) => x.an).map((x) => x.id) : []);
  infoPanel.querySelectorAll("input[data-g]").forEach((f) => { f.checked = infoAn.has(f.dataset.g); });
  aktualisiereBereichsSchalter();
  speichereInfoAuswahl();
  setzeInfoFilter();
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
});

// ---------- 4. Klick auf einen Ort ----------
map.on("click", (e) => {
  if (aktuelleAnsicht !== "infos" || !kartenBereit) return;
  const treffer = map.queryRenderedFeatures(e.point, { layers: ["info-punkte"] });
  if (infoPopup) { infoPopup.remove(); infoPopup = null; }
  if (!treffer.length) return;
  const p = treffer[0].properties, gr = infoGruppe[p.g];
  const html = `<strong>${htmlSicher(p.name || "(ohne Namen)")}</strong><br><span class="pop-art">${htmlSicher(gr.name)}${p.art && p.art !== "yes" ? ` · ${htmlSicher(p.art)}` : ""}</span>` +
    (p.adr ? `<br>${htmlSicher(p.adr)}` : "") + (p.betreiber ? `<br>Betreiber: ${htmlSicher(p.betreiber)}` : "") +
    (p.zeiten ? `<br>Öffnungszeiten: ${htmlSicher(p.zeiten)}` : "") +
    `<br><span class="pop-art">OpenStreetMap-Eintrag, nicht geprüft</span>`;
  infoPopup = new maplibregl.Popup({ maxWidth: "260px", offset: 12 }).setLngLat(treffer[0].geometry.coordinates).setHTML(html).addTo(map);
});

map.on("mousemove", (e) => {
  if (aktuelleAnsicht !== "infos" || !kartenBereit || zeichnen) return;
  map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ["info-punkte"] }).length ? "pointer" : "";
});

// ---------- 5. Legende (wird von legende.js benutzt) ----------
function infoEckdaten() {
  if (!infoVorhanden) return [];
  const punkte = INFO_GRUPPEN.filter((x) => !x.linie && infoAn.has(x.id)).reduce((s, x) => s + (infoZaehler[x.id] || 0), 0);
  return [["Gruppen an", `${zahl(infoAn.size)} von ${zahl(INFO_GRUPPEN.length)}`], ["Orte sichtbar", zahl(punkte)]];
}

baueInfoPanel();
zeichneInfoZahlen();
