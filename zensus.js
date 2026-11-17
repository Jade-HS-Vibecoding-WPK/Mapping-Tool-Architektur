/* ============================================================
   Ortsanalyse – Wohnen (Zensus 2022)
   Sechs Karten im 100-m-Gitter, Stichtag 15.05.2022:
   Nettokaltmiete, Leerstandsquote, Fläche je Wohnung, Wohnfläche je Bewohner,
   Eigentümerquote und Gebäude nach Baujahr.
   Mieten sind Bestandsmieten (was gezahlt wird), keine Angebotsmieten.
   Werte in Klammern (= unsicher) werden markiert. „–“ in den Tabellen heißt „genau null“.
   Quelle: Statistische Ämter des Bundes und der Länder, Zensus 2022, dl-de/by-2-0.
   - Beispiel Oldenburg: eingebaut (data/beispiel-oldenburg-zensus.js)
   - andere Gebiete: die Zensus-ZIPs ins Ablagefeld legen (der Server erlaubt keinen direkten Abruf)
   ============================================================ */

proj4.defs("EPSG:3035", "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const laeaZuGrad = (x, y) => proj4("EPSG:3035", "EPSG:4326", [x, y]);
const gradZuLaea = (lon, lat) => proj4("EPSG:4326", "EPSG:3035", [lon, lat]);

// Die Merkmale: Name, Einheit, Nachkommastellen, Dateiname der Zensus-Tabelle und der ZIP zum Herunterladen
const ZENSUS_MERKMALE = {
  miete: { name: "Nettokaltmiete", knopf: "Miete", einheit: "€/m²", stellen: 2, datei: /nettokaltmiete/,
    zip: "Zensus2022_Durchschn_Nettokaltmiete", erklaerung: "Bestandsmieten: was in laufenden Verträgen gezahlt wird" },
  leerstand: { name: "Leerstandsquote", knopf: "Leerstand", einheit: "%", stellen: 1, datei: /^zensus2022_leerstandsquote/,
    zip: "Leerstandsquote_in_Gitterzellen", grenzen: [3, 6, 10],
    erklaerung: "Anteil leerstehender Wohnungen (ohne Ferien- und gewerbliche Wohnungen); bis etwa 3 % gilt als normale Umzugsreserve" },
  flaecheWohnung: { name: "Fläche je Wohnung", knopf: "m² je Wohnung", einheit: "m²", stellen: 0, datei: /flaeche_je_wohnung/,
    zip: "Durchschnittliche_Flaeche_je_Wohnung_in_Gitterzellen", erklaerung: "durchschnittliche Wohnfläche einer Wohnung" },
  flaecheBewohner: { name: "Wohnfläche je Bewohner", knopf: "m² je Person", einheit: "m²", stellen: 0, datei: /flaeche_je_bewohner/,
    zip: "Durchschnittliche_Wohnflaeche_je_Bewohner_in_Gitterzellen", erklaerung: "Wohnfläche je Person: niedrig = dicht belegt" },
  eigentum: { name: "Eigentümerquote", knopf: "Eigentum", einheit: "%", stellen: 0, datei: /eigentuemerquote/,
    zip: "Eigentuemerquote_in_Gitterzellen", erklaerung: "Anteil der Wohnungen, die ihre Eigentümer selbst bewohnen (Rest: Miete)" },
  baujahr: { name: "Baualter", knopf: "Baujahr", einheit: "", stellen: 0, datei: /baujahr_jz/,
    zip: "Gebaeude_nach_Baujahr_Jahrzehnte", erklaerung: "überwiegendes Baujahr der Gebäude mit Wohnraum" }
};

// Die zehn Baujahr-Spalten des Zensus, für Karte und Kennzahlen zu sechs Epochen zusammengefasst
const BAUJAHR_EPOCHEN = [
  ["vor 1919", [0]], ["1919–1949", [1]], ["1950–1969", [2, 3]], ["1970–1989", [4, 5]], ["1990–2009", [6, 7]], ["ab 2010", [8, 9]]
];

// Importierte Zensus-Tabellen je Merkmal:
// { x: Int32Array, y: Int32Array, wert: Float32Array, unsicher: Uint8Array } bzw. beim Baujahr { x, y, klassen: Uint16Array (10 je Zelle) }
const zensusImport = {};

// Welches Merkmal gehört zu einer Datei? (nur 100-m-Tabellen im CSV-Format)
function zensusMerkmalAusDatei(dateiname) {
  const n = dateiname.toLowerCase();
  if (!n.endsWith(".csv")) return null;
  return Object.keys(ZENSUS_MERKMALE).find((m) => ZENSUS_MERKMALE[m].datei.test(n)) || null;
}

function ladeBeispielZensus() {
  if (window.BEISPIEL_ZENSUS) return Promise.resolve(window.BEISPIEL_ZENSUS);
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = "data/beispiel-oldenburg-zensus.js";
    s.onload = () => ok(window.BEISPIEL_ZENSUS);
    s.onerror = () => fehler(new Error("Zensus-Beispieldaten nicht gefunden"));
    document.head.appendChild(s);
  });
}

// Zensus-Zellen für das Rechteck als GeoJSON-Quadrate (100 × 100 m), auf das Gebiet zugeschnitten.
// Jede Zelle trägt alle vorhandenen Merkmale als Eigenschaften (fehlende Merkmale fehlen auch als Eigenschaft).
async function zensuszellen(bbox) {
  const [w, s, o, n] = bbox;
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuLaea(lon, lat));
  const x0 = Math.min(...ecken.map((p) => p[0])) - 50, x1 = Math.max(...ecken.map((p) => p[0])) + 50;
  const y0 = Math.min(...ecken.map((p) => p[1])) - 50, y1 = Math.max(...ecken.map((p) => p[1])) + 50;
  const imGebiet = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  const zellen = new Map(); // "x_y" → Eigenschaften
  const zelle = (x, y) => {
    const schluessel = `${x}_${y}`;
    if (!zellen.has(schluessel)) zellen.set(schluessel, { x, y });
    return zellen.get(schluessel);
  };
  const setze = (m, x, y, wert, unsicher) => {
    const p = zelle(x, y);
    if (m === "baujahr") p.baujahrAnzahl = wert;
    else { p[m] = wert; if (unsicher) p[`${m}Unsicher`] = true; }
  };

  let beispiel;
  for (const m of Object.keys(ZENSUS_MERKMALE)) {
    // 1. importierte Tabelle (ganz Deutschland), 2. eingebautes Beispiel Oldenburg
    let gefunden = false;
    const imp = zensusImport[m];
    if (imp) {
      for (let i = 0; i < imp.x.length; i++) {
        if (!imGebiet(imp.x[i], imp.y[i])) continue;
        gefunden = true;
        if (m === "baujahr") setze(m, imp.x[i], imp.y[i], Array.from(imp.klassen.subarray(i * 10, i * 10 + 10)));
        else setze(m, imp.x[i], imp.y[i], imp.wert[i], imp.unsicher[i]);
      }
    }
    if (!gefunden && beruehrtBeispielgebiet(bbox)) {
      if (beispiel === undefined) beispiel = await ladeBeispielZensus().catch(() => null);
      for (const z of (beispiel && beispiel.merkmale[m]) || []) {
        if (imGebiet(z[0], z[1])) setze(m, z[0], z[1], z[2], z[3]);
      }
    }
  }
  if (!zellen.size) return null;

  const features = [];
  for (const p of zellen.values()) {
    const { x, y } = p;
    delete p.x; delete p.y;
    if (p.baujahrAnzahl) {
      // Gebäude je Epoche; überwiegende Epoche als Zahl 0–5 (für die Farbe der Karte)
      p.baujahrEpochen = BAUJAHR_EPOCHEN.map(([, spalten]) => spalten.reduce((s, i) => s + p.baujahrAnzahl[i], 0));
      const summe = p.baujahrEpochen.reduce((a, b) => a + b, 0);
      if (summe) p.baujahr = p.baujahrEpochen.indexOf(Math.max(...p.baujahrEpochen));
    }
    const ring = [[x - 50, y - 50], [x + 50, y - 50], [x + 50, y + 50], [x - 50, y + 50], [x - 50, y - 50]].map(([a, b]) => laeaZuGrad(a, b));
    const teil = schneide({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} }, bbox);
    if (teil) { teil.properties = p; features.push(teil); }
  }
  return features.length ? { type: "FeatureCollection", features } : null;
}

// Kennzahlen je Merkmal: Mittel, Median, Spanne der Zellwerte; beim Baujahr Gebäude je Epoche
function zensusKennzahlen(zensus) {
  if (!zensus) return {};
  const ergebnis = {};
  for (const m of Object.keys(ZENSUS_MERKMALE)) {
    if (m === "baujahr") continue;
    const mit = zensus.features.filter((f) => f.properties[m] != null);
    if (!mit.length) continue;
    const werte = mit.map((f) => f.properties[m]).sort((a, b) => a - b);
    ergebnis[m] = {
      zellen: werte.length,
      mittel: werte.reduce((a, b) => a + b, 0) / werte.length,
      median: werte[Math.floor(werte.length / 2)],
      min: werte[0],
      max: werte[werte.length - 1],
      unsicher: mit.filter((f) => f.properties[`${m}Unsicher`]).length
    };
  }
  const epochen = BAUJAHR_EPOCHEN.map(() => 0);
  for (const f of zensus.features) (f.properties.baujahrEpochen || []).forEach((a, i) => { epochen[i] += a; });
  const gebaeude = epochen.reduce((a, b) => a + b, 0);
  if (gebaeude) ergebnis.baujahr = { epochen, gebaeude, ueberwiegend: epochen.indexOf(Math.max(...epochen)) };
  return { zensus: ergebnis };
}

// Ein Wert mit Einheit, z. B. „8,37 €/m²“ oder „4,5 %“
function zensusWert(m, wert) {
  const d = ZENSUS_MERKMALE[m];
  return `${fmt(wert, d.stellen)}${d.einheit ? ` ${d.einheit}` : ""}`;
}
