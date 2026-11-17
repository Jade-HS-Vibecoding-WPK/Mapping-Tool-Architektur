/* ============================================================
   Ortsanalyse – Infrastruktur (Reiter „Infrastruktur“)
   Orte aus OpenStreetMap in sechs Ebenen: Mobilität, Bildung und Soziales, Versorgung und Gesundheit,
   Kultur, Gastronomie, Stadtmöbel. Dazu Einzugsradien um Haltestellen (300 m) und Spielplätze (500 m).
   Piktogramme: Maki (Mapbox, CC0), siehe piktogramme.js.
   Keine Personendaten: Bei Arztpraxen wird kein Name gezeigt (oft der Name der Ärztin / des Arztes).
   ============================================================ */

const INFRA_EBENEN = {
  mobilitaet: { name: "Mobilität", farbe: "#2c5d8f" },
  bildung: { name: "Bildung und Soziales", farbe: "#6f4a99" },
  versorgung: { name: "Versorgung und Gesundheit", farbe: "#2e7a55" },
  kultur: { name: "Kultur", farbe: "#9a5b22" },
  gastro: { name: "Gastronomie", farbe: "#c23b22" },
  moebel: { name: "Stadtmöbel", farbe: "#626262" }
};

// Arten: [Schlüssel, Ebene, Name, Maki-Symbol, Prüfung der OSM-Merkmale]. Die erste passende Art gilt.
const istGesundheit = (t) => ["doctors", "dentist", "clinic"].includes(t.amenity)
  || (t.healthcare && !["pharmacy", "hospital"].includes(t.healthcare));
const INFRA_ARTEN = [
  ["bahnhof", "mobilitaet", "Bahnhof, Haltepunkt", "rail", (t) => t.railway === "station" || t.railway === "halt"],
  ["haltestelle", "mobilitaet", "Bus- und Tramhaltestelle", "bus", (t) => t.highway === "bus_stop" || t.railway === "tram_stop"
    || (t.public_transport === "platform" && t.railway !== "platform" && t.train !== "yes")],
  ["fahrradparken", "mobilitaet", "Fahrradstellplätze", "bicycle", (t) => t.amenity === "bicycle_parking"],
  ["leihrad", "mobilitaet", "Leihräder", "bicycle-share", (t) => t.amenity === "bicycle_rental"],
  ["carsharing", "mobilitaet", "Carsharing", "car-rental", (t) => t.amenity === "car_sharing"],
  ["ladesaeule", "mobilitaet", "Ladesäule (E-Auto)", "charging-station", (t) => t.amenity === "charging_station"],
  ["parkhaus", "mobilitaet", "Parkhaus, Tiefgarage", "parking-garage", (t) => t.amenity === "parking"],
  ["taxi", "mobilitaet", "Taxistand", "car", (t) => t.amenity === "taxi"],
  ["schule", "bildung", "Schule", "school", (t) => t.amenity === "school"],
  ["kita", "bildung", "Kita, Kindergarten", "home", (t) => t.amenity === "kindergarten" || t.amenity === "childcare"],
  ["hochschule", "bildung", "Hochschule", "college", (t) => t.amenity === "university" || t.amenity === "college"],
  ["bibliothek", "bildung", "Bibliothek", "library", (t) => t.amenity === "library"],
  ["spielplatz", "bildung", "Spielplatz", "playground", (t) => t.leisure === "playground"],
  ["sport", "bildung", "Sportplatz, Sporthalle", "pitch", (t) => ["pitch", "sports_centre", "fitness_station"].includes(t.leisure)],
  ["treff", "bildung", "Treff, soziale Einrichtung", "heart", (t) => t.amenity === "community_centre" || t.amenity === "social_facility"],
  ["supermarkt", "versorgung", "Supermarkt", "grocery", (t) => t.shop === "supermarket"],
  ["kiosk", "versorgung", "Kiosk, kleiner Laden", "convenience", (t) => t.shop === "convenience"],
  ["baecker", "versorgung", "Bäckerei", "bakery", (t) => t.shop === "bakery"],
  ["apotheke", "versorgung", "Apotheke", "pharmacy", (t) => t.amenity === "pharmacy" || t.healthcare === "pharmacy"],
  ["krankenhaus", "versorgung", "Krankenhaus", "hospital", (t) => t.amenity === "hospital" || t.healthcare === "hospital"],
  ["arzt", "versorgung", "Arzt, Praxis", "doctor", istGesundheit],
  ["post", "versorgung", "Post", "post", (t) => t.amenity === "post_office"],
  ["geld", "versorgung", "Bank, Geldautomat", "bank", (t) => t.amenity === "bank" || t.amenity === "atm"],
  ["museum", "kultur", "Museum, Galerie", "museum", (t) => t.tourism === "museum" || t.tourism === "gallery"],
  ["theater", "kultur", "Theater, Kulturzentrum", "theatre", (t) => t.amenity === "theatre" || t.amenity === "arts_centre"],
  ["kino", "kultur", "Kino", "cinema", (t) => t.amenity === "cinema"],
  ["kirche", "kultur", "Kirche, Gebetsort", "place-of-worship", (t) => t.amenity === "place_of_worship"],
  ["denkmal", "kultur", "Denkmal, Gedenkort", "monument", (t) => t.historic === "monument" || t.historic === "memorial"],
  ["cafe", "gastro", "Café", "cafe", (t) => t.amenity === "cafe"],
  ["restaurant", "gastro", "Restaurant", "restaurant", (t) => t.amenity === "restaurant"],
  ["kneipe", "gastro", "Bar, Kneipe, Biergarten", "beer", (t) => ["bar", "pub", "biergarten"].includes(t.amenity)],
  ["imbiss", "gastro", "Imbiss", "fast-food", (t) => t.amenity === "fast_food"],
  ["eis", "gastro", "Eiscafé", "ice-cream", (t) => t.amenity === "ice_cream"],
  ["sitzbank", "moebel", "Sitzbank", "picnic-site", (t) => t.amenity === "bench"],
  ["toilette", "moebel", "Öffentliche Toilette", "toilet", (t) => t.amenity === "toilets"],
  ["trinkwasser", "moebel", "Trinkbrunnen", "drinking-water", (t) => t.amenity === "drinking_water"],
  ["muelleimer", "moebel", "Mülleimer", "waste-basket", (t) => t.amenity === "waste_basket"]
];
const INFRA_ART = Object.fromEntries(INFRA_ARTEN.map(([key, ebene, name, symbol]) => [key, { ebene, name, symbol }]));
const OHNE_NAMEN = new Set(["arzt"]); // Namen von Praxen sind oft Personennamen

// Einzugsradien: welche Arten, wie weit
const INFRA_RADIEN = {
  halt: { name: "Haltestellen", radius: 300, arten: ["haltestelle", "bahnhof"], farbe: INFRA_EBENEN.mobilitaet.farbe },
  spiel: { name: "Spielplätze", radius: 500, arten: ["spielplatz"], farbe: INFRA_EBENEN.bildung.farbe }
};

// Die Frage an Overpass (gleich in werkzeuge/infra_beispiel.py)
function infraAbfrage([west, sued, ost, nord]) {
  return `[out:json][timeout:90][bbox:${sued},${west},${nord},${ost}];
(
  nwr["highway"="bus_stop"];
  nwr["railway"~"^(tram_stop|station|halt)$"];
  nwr["public_transport"="platform"];
  nwr["amenity"~"^(bicycle_parking|bicycle_rental|car_sharing|charging_station|taxi|school|kindergarten|childcare|university|college|library|community_centre|social_facility|pharmacy|doctors|dentist|clinic|hospital|post_office|bank|atm|theatre|cinema|arts_centre|place_of_worship|cafe|restaurant|bar|pub|fast_food|biergarten|ice_cream|bench|toilets|drinking_water|waste_basket)$"];
  nwr["amenity"="parking"]["parking"~"^(multi-storey|underground)$"];
  nwr["leisure"~"^(playground|pitch|sports_centre|fitness_station)$"];
  nwr["shop"~"^(supermarket|convenience|bakery)$"];
  nwr["tourism"~"^(museum|gallery)$"];
  nwr["historic"~"^(monument|memorial)$"];
);
out center tags;`;
}

function ladeBeispielInfra() {
  if (window.BEISPIEL_INFRA) return Promise.resolve(window.BEISPIEL_INFRA);
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = "data/beispiel-oldenburg-infra.js";
    s.onload = () => ok(window.BEISPIEL_INFRA);
    s.onerror = () => fehler(new Error("Infrastruktur-Beispieldaten nicht gefunden"));
    document.head.appendChild(s);
  });
}

// Punkte laden: live von Overpass, im Beispiel (oder wenn Overpass nicht antwortet) aus den eingebauten Daten.
// Ergebnis: { punkte: FeatureCollection, radien: { halt: Feature, spiel: Feature }, herkunft }
async function ladeInfrastruktur(bbox, nurBeispiel, meldung) {
  let roh = null, herkunft = "live abgefragt";
  if (!nurBeispiel) {
    try {
      const json = await overpassHolen(infraAbfrage(bbox), meldung, "Haltestellen, Spielplätze und weitere Orte");
      roh = json.elements.map((e) => [e.lon ?? (e.center && e.center.lon), e.lat ?? (e.center && e.center.lat), e.type[0] + e.id, e.tags || {}]);
    } catch (fehler) {
      console.warn("Infrastruktur nicht live verfügbar:", fehler);
    }
  }
  if (!roh && beruehrtBeispielgebiet(bbox)) {
    const b = await ladeBeispielInfra().catch(() => null);
    if (b) { roh = b.punkte; herkunft = `eingebaute Beispieldaten, Stand ${b.stand}`; }
  }
  if (!roh) return null;
  const punkte = infraPunkte(roh, bbox);
  const radien = {};
  for (const [key, r] of Object.entries(INFRA_RADIEN)) {
    const quellen = punkte.features.filter((f) => r.arten.includes(f.properties.art));
    const flaeche = einzugsflaeche(quellen, r.radius);
    if (flaeche) { flaeche.properties = { radius: key }; radien[key] = flaeche; }
  }
  return { punkte, radien, herkunft };
}

// Rohdaten [lon, lat, id, Merkmale] → Punkte mit Art und Ebene, nur im Gebiet, doppelte zusammengefasst
function infraPunkte(roh, [w, s, o, n]) {
  const features = [];
  for (const [lon, lat, id, t] of roh) {
    if (lon == null || lon < w || lon > o || lat < s || lat > n) continue;
    const treffer = INFRA_ARTEN.find((a) => a[4](t));
    if (!treffer) continue;
    const [art, ebene] = treffer;
    const name = OHNE_NAMEN.has(art) ? "" : (t.name || "");
    // Haltestellen sind oft doppelt erfasst (Mast und Bahnsteig): gleiche Art und gleicher Name in 30 m = ein Ort
    if (name && features.some((f) => f.properties.art === art && f.properties.name === name
      && turf.distance(f.geometry.coordinates, [lon, lat]) < 0.03)) continue;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { id, art, ebene, name, icon: `infra-${art}` } });
  }
  return { type: "FeatureCollection", features };
}

// Fläche im Umkreis der Punkte (alle Kreise vereinigt)
function einzugsflaeche(punkte, radiusMeter) {
  if (!punkte.length) return null;
  const kreise = punkte.map((p) => turf.circle(p.geometry.coordinates, radiusMeter / 1000, { steps: 48, units: "kilometers" }));
  if (kreise.length === 1) return kreise[0];
  try { return turf.union(turf.featureCollection(kreise)); } catch (e) { return null; }
}

// Kennzahlen: Anzahl je Art und Anteil des Gebiets innerhalb der Einzugsradien
function infraKennzahlen(infra, bbox) {
  if (!infra) return {};
  const anzahl = {};
  for (const f of infra.punkte.features) anzahl[f.properties.art] = (anzahl[f.properties.art] || 0) + 1;
  const gebiet = turf.bboxPolygon(bbox), gebietM2 = turf.area(gebiet);
  const abdeckung = {};
  for (const key of Object.keys(INFRA_RADIEN)) {
    const r = infra.radien[key];
    let teil = null;
    try { teil = r ? turf.intersect(turf.featureCollection([r, gebiet])) : null; } catch (e) { teil = null; }
    abdeckung[key] = teil ? turf.area(teil) / gebietM2 : 0;
  }
  return { infraAnzahl: anzahl, infraAbdeckung: abdeckung };
}

// Piktogramm als SVG: farbiger Kreis der Ebene mit weißem Maki-Symbol
function piktogrammSvg(art) {
  const a = INFRA_ART[art];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">`
    + `<circle cx="18" cy="18" r="16.5" fill="${INFRA_EBENEN[a.ebene].farbe}" stroke="#ffffff" stroke-width="2"/>`
    + `<g transform="translate(8.25 8.25) scale(1.3)" fill="#ffffff"><path d="${MAKI[a.symbol]}"/></g></svg>`;
}
const piktogrammUrl = (art) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(piktogrammSvg(art))}`;

// Alle Piktogramme als Bilder in die Planansicht laden (einmalig)
async function infraBilderLaden(karte) {
  await Promise.all(Object.keys(INFRA_ART).map(async (art) => {
    if (karte.hasImage(`infra-${art}`)) return;
    const bild = new Image(36, 36);
    bild.src = piktogrammUrl(art);
    await bild.decode();
    if (!karte.hasImage(`infra-${art}`)) karte.addImage(`infra-${art}`, bild, { pixelRatio: 2 });
  }));
}

// Text aus OSM sicher in HTML einsetzen
const htmlSicher = (text) => String(text).replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[z]);
