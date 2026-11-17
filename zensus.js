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
    zip: "Gebaeude_nach_Baujahr_Jahrzehnte", erklaerung: "überwiegendes Baujahr der Gebäude mit Wohnraum" },
  // Miete vergleichbarer Wohnungen: vier Werte je Zelle (Baualter × Größe), gezeigt wird die Auswahl im Mietrechner
  vergleich: { name: "Miete vergleichbarer Wohnungen", knopf: "Miete vergleichbar", einheit: "€/m²", stellen: 2, datei: null,
    zip: null, erklaerung: "Nettokaltmiete von Wohnungen gleichen Baualters und ähnlicher Größe (destatis „Mietvergleich“)" }
};

// Vier Vergleichsmieten: Eigenschaft je Zelle ← Spalte der destatis-Kacheln
const VERGLEICH_FELDER = {
  vAK: { spalte: "alt_1990_und_frueher__klein_65qm_und_weniger", text: "vor 1991 gebaut, bis 65 m²" },
  vAG: { spalte: "alt_1990_und_frueher__gross_ueber_65qm", text: "vor 1991 gebaut, über 65 m²" },
  vNK: { spalte: "jung_nach_1990__klein_65qm_und_weniger", text: "ab 1991 gebaut, bis 65 m²" },
  vNG: { spalte: "jung_nach_1990__gross_ueber_65qm", text: "ab 1991 gebaut, über 65 m²" }
};

// Mietrechner (Reiter „Wohnen“): Baualter und Größe der eigenen Wohnung
const mietrechner = { neu: false, flaeche: 75 };
const vergleichFeld = () => `v${mietrechner.neu ? "N" : "A"}${mietrechner.flaeche > 65 ? "G" : "K"}`;

// Baualter in sechs Epochen. Die Zensus-Quellen teilen unterschiedlich ein (±1 Jahr an den Grenzen):
// [Name, Spalten der Tabelle „Baujahr (Jahrzehnte)“, Spalten der destatis-Kacheln]
const BAUJAHR_EPOCHEN = [
  ["vor 1919", [0], [0]],
  ["1919–1948", [1], [1]],
  ["1949–1978", [2, 3, 4], [2]],
  ["1979–1990", [5], [3]],
  ["1991–2010", [6, 7], [4, 5]],
  ["ab 2011", [8, 9], [6, 7]]
];
const epochenAus = (anzahl, quelle) => BAUJAHR_EPOCHEN.map((e) => e[quelle === "destatis" ? 2 : 1].reduce((s, i) => s + (anzahl[i] || 0), 0));

// destatis-Kacheln („Mietvergleich“, Zensus 2022): 100-m-Zellen in Kacheln von 125 × 125 Zellen, EPSG:3035.
// Enthalten die vier Vergleichsmieten, Gebäude nach Baujahr (8 Klassen), Fläche je Wohnung, Eigentümerquote.
const DESTATIS = {
  url: "https://service.destatis.de/DE/konferenzen/NIAM2026/tiled_data_Gebalter_Wohngr65qm_Miete_zusatz_js/",
  x0: 4031700, y0: 2691200, kachel: 12500, zellen: 125,
  baujahr: ["Vor1919", "a1919bis1948", "a1949bis1978", "a1979bis1990", "a1991bis2000", "a2001bis2010", "a2011bis2019", "a2020undspaeter"]
};

// Zellen im Rechteck (EPSG:3035) live von destatis laden. Ergebnis: Liste je Merkmal wie in den Beispieldaten.
async function ladeDestatis(x0, x1, y0, y1) {
  const k = DESTATIS.kachel;
  const auftraege = [];
  for (let xt = Math.floor((x0 - DESTATIS.x0) / k); xt <= Math.floor((x1 - DESTATIS.x0) / k); xt++) {
    for (let yt = Math.floor((y0 - DESTATIS.y0) / k); yt <= Math.floor((y1 - DESTATIS.y0) / k); yt++) {
      auftraege.push((async () => {
        const abbruch = new AbortController();
        const zeit = setTimeout(() => abbruch.abort(), 20000);
        try {
          const antwort = await fetch(`${DESTATIS.url}${xt}/${yt}.js`, { signal: abbruch.signal });
          const text = antwort.ok ? await antwort.text() : "";
          // fehlende Kacheln (z. B. Meer) liefern eine HTML-Fehlerseite
          return text.startsWith("alt_1990") ? { xt, yt, text } : null;
        } finally { clearTimeout(zeit); }
      })());
    }
  }
  const kacheln = (await Promise.all(auftraege)).filter(Boolean);
  if (!kacheln.length) throw new Error("keine destatis-Kacheln");
  const liste = { vergleich: [], flaecheWohnung: [], eigentum: [], baujahr: [] };
  for (const { xt, yt, text } of kacheln) {
    const zeilen = text.trim().split("\n");
    const kopf = zeilen[0].split(",");
    const spalte = Object.fromEntries(kopf.map((name, i) => [name, i]));
    for (let i = 1; i < zeilen.length; i++) {
      const t = zeilen[i].split(",");
      const x = DESTATIS.x0 + (xt * DESTATIS.zellen + +t[spalte.x]) * 100 + 50; // Zellmitte
      const y = DESTATIS.y0 + (yt * DESTATIS.zellen + +t[spalte.y]) * 100 + 50;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const zahl = (name) => (t[spalte[name]] === "" ? null : +t[spalte[name]]);
      const v = Object.values(VERGLEICH_FELDER).map((f) => zahl(f.spalte));
      if (v.some((w) => w != null)) liste.vergleich.push([x, y, ...v]);
      if (zahl("durchschnFlaechejeWohn") != null) liste.flaecheWohnung.push([x, y, zahl("durchschnFlaechejeWohn"), 0]);
      liste.eigentum.push([x, y, zahl("Eigentuemerquote") || 0, 0]); // leer = 0 % (wie „–“ im Zensus)
      const anzahl = DESTATIS.baujahr.map((name) => zahl(name) || 0);
      if (anzahl.some(Boolean)) liste.baujahr.push([x, y, epochenAus(anzahl, "destatis")]);
    }
  }
  return liste;
}

// Importierte Zensus-Tabellen je Merkmal:
// { x: Int32Array, y: Int32Array, wert: Float32Array, unsicher: Uint8Array } bzw. beim Baujahr { x, y, klassen: Uint16Array (10 je Zelle) }
const zensusImport = {};

// Welches Merkmal gehört zu einer Datei? (nur 100-m-Tabellen im CSV-Format)
function zensusMerkmalAusDatei(dateiname) {
  const n = dateiname.toLowerCase();
  if (!n.endsWith(".csv")) return null;
  return Object.keys(ZENSUS_MERKMALE).find((m) => ZENSUS_MERKMALE[m].datei && ZENSUS_MERKMALE[m].datei.test(n)) || null;
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
// Reihenfolge je Merkmal: 1. importierte ZIP, 2. live von destatis (nicht im Beispiel-Modus), 3. eingebautes Beispiel.
// Ergebnis: FeatureCollection, dazu .quellen = { Merkmal: "import" | "destatis" | "beispiel" }
async function zensuszellen(bbox, nurBeispiel = false) {
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
  // Ein Eintrag wie in den Beispieldaten: [x, y, Wert, unsicher] bzw. Baujahr [x, y, Epochen], Vergleich [x, y, 4 Mieten]
  const setze = (m, z, quelle) => {
    const p = zelle(z[0], z[1]);
    if (m === "baujahr") p.baujahrEpochen = quelle === "beispiel" || quelle === "import" ? epochenAus(z[2], "jahrzehnte") : z[2];
    else if (m === "vergleich") Object.keys(VERGLEICH_FELDER).forEach((f, i) => { if (z[2 + i] != null) p[f] = z[2 + i]; });
    else { p[m] = z[2]; if (z[3]) p[`${m}Unsicher`] = true; }
  };

  let live = null, beispiel;
  if (!nurBeispiel) live = await ladeDestatis(x0, x1, y0, y1).catch((fehler) => { console.warn("destatis nicht erreichbar:", fehler); return null; });
  const quellen = {};
  for (const m of Object.keys(ZENSUS_MERKMALE)) {
    const imp = zensusImport[m];
    if (imp) {
      for (let i = 0; i < imp.x.length; i++) {
        if (!imGebiet(imp.x[i], imp.y[i])) continue;
        quellen[m] = "import";
        if (m === "baujahr") setze(m, [imp.x[i], imp.y[i], Array.from(imp.klassen.subarray(i * 10, i * 10 + 10))], "import");
        else setze(m, [imp.x[i], imp.y[i], imp.wert[i], imp.unsicher[i]], "import");
      }
    }
    if (!quellen[m] && live && live[m] && live[m].length) {
      quellen[m] = "destatis";
      live[m].forEach((z) => setze(m, z, "destatis"));
    }
    if (!quellen[m] && beruehrtBeispielgebiet(bbox)) {
      if (beispiel === undefined) beispiel = await ladeBeispielZensus().catch(() => null);
      for (const z of (beispiel && beispiel.merkmale[m]) || []) {
        if (imGebiet(z[0], z[1])) { setze(m, z, "beispiel"); quellen[m] = "beispiel"; }
      }
    }
  }
  if (!zellen.size) return null;

  const features = [];
  for (const p of zellen.values()) {
    const { x, y } = p;
    delete p.x; delete p.y;
    if (p.baujahrEpochen) {
      // überwiegende Epoche als Zahl 0–5 (für die Farbe der Karte)
      const summe = p.baujahrEpochen.reduce((a, b) => a + b, 0);
      if (summe) p.baujahr = p.baujahrEpochen.indexOf(Math.max(...p.baujahrEpochen));
    }
    const ring = [[x - 50, y - 50], [x + 50, y - 50], [x + 50, y + 50], [x - 50, y + 50], [x - 50, y - 50]].map(([a, b]) => laeaZuGrad(a, b));
    const teil = schneide({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} }, bbox);
    if (teil) { teil.properties = p; features.push(teil); }
  }
  return features.length ? { type: "FeatureCollection", features, quellen } : null;
}

// Kaltmiete einer Wohnung nach dem Mietrechner: €/m² der passenden Vergleichsmiete × Fläche
const kaltmiete = (euroJeM2) => Math.round(euroJeM2 * mietrechner.flaeche / 10) * 10;

// Kennzahlen je Merkmal: Mittel, Median, Spanne der Zellwerte; beim Baujahr Gebäude je Epoche
function zensusKennzahlen(zensus) {
  if (!zensus) return {};
  const ergebnis = {};
  const statistik = (feld) => {
    const mit = zensus.features.filter((f) => f.properties[feld] != null);
    if (!mit.length) return null;
    const werte = mit.map((f) => f.properties[feld]).sort((a, b) => a - b);
    return {
      zellen: werte.length,
      mittel: werte.reduce((a, b) => a + b, 0) / werte.length,
      median: werte[Math.floor(werte.length / 2)],
      min: werte[0],
      max: werte[werte.length - 1],
      unsicher: mit.filter((f) => f.properties[`${feld}Unsicher`]).length
    };
  };
  for (const m of Object.keys(ZENSUS_MERKMALE)) {
    if (m === "baujahr" || m === "vergleich") continue;
    const st = statistik(m);
    if (st) ergebnis[m] = st;
  }
  // Vergleichsmieten: je Baualter × Größe
  const vergleich = Object.fromEntries(Object.keys(VERGLEICH_FELDER).map((f) => [f, statistik(f)]).filter(([, st]) => st));
  if (Object.keys(vergleich).length) ergebnis.vergleich = vergleich;
  ergebnis.quellen = zensus.quellen || {};
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
