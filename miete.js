/* ============================================================
   Ortsanalyse – Mietkarte (Zensus 2022)
   Durchschnittliche Nettokaltmiete je m² in 100-m-Gitterzellen, Stichtag 15.05.2022.
   Bestandsmieten (was gezahlt wird), keine Angebotsmieten. Werte in Klammern (= unsicher) werden markiert.
   Quelle: Statistische Ämter des Bundes und der Länder, Zensus 2022, dl-de/by-2-0.
   - Beispiel Oldenburg: eingebaut (data/beispiel-oldenburg-miete.js)
   - andere Gebiete: die Zensus-ZIP ins Ablagefeld legen (der Server erlaubt keinen direkten Abruf)
   ============================================================ */

proj4.defs("EPSG:3035", "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const laeaZuGrad = (x, y) => proj4("EPSG:3035", "EPSG:4326", [x, y]);
const gradZuLaea = (lon, lat) => proj4("EPSG:4326", "EPSG:3035", [lon, lat]);

let mietImport = null; // { x: Int32Array, y: Int32Array, wert: Float32Array, unsicher: Uint8Array } aus der Zensus-ZIP

function ladeBeispielMiete() {
  if (window.BEISPIEL_MIETE) return Promise.resolve(window.BEISPIEL_MIETE);
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = "data/beispiel-oldenburg-miete.js";
    s.onload = () => ok(window.BEISPIEL_MIETE);
    s.onerror = () => fehler(new Error("Miet-Beispieldaten nicht gefunden"));
    document.head.appendChild(s);
  });
}

// Mietzellen für das Rechteck als GeoJSON-Quadrate (100 × 100 m), auf das Gebiet zugeschnitten
async function mietzellen(bbox) {
  const [w, s, o, n] = bbox;
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuLaea(lon, lat));
  const x0 = Math.min(...ecken.map((p) => p[0])) - 50, x1 = Math.max(...ecken.map((p) => p[0])) + 50;
  const y0 = Math.min(...ecken.map((p) => p[1])) - 50, y1 = Math.max(...ecken.map((p) => p[1])) + 50;
  let liste = [];
  if (mietImport) {
    const m = mietImport;
    for (let i = 0; i < m.x.length; i++) {
      if (m.x[i] >= x0 && m.x[i] <= x1 && m.y[i] >= y0 && m.y[i] <= y1) liste.push([m.x[i], m.y[i], m.wert[i], m.unsicher[i]]);
    }
  }
  if (!liste.length && beruehrtBeispielgebiet(bbox)) {
    const b = await ladeBeispielMiete().catch(() => null);
    if (b) liste = b.zellen;
  }
  if (!liste.length) return null;
  const features = [];
  for (const [x, y, wert, unsicher] of liste) {
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const ring = [[x - 50, y - 50], [x + 50, y - 50], [x + 50, y + 50], [x - 50, y + 50], [x - 50, y - 50]].map(([a, b]) => laeaZuGrad(a, b));
    const teil = schneide({ type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} }, bbox);
    if (teil) { teil.properties = { wert, unsicher: !!unsicher }; features.push(teil); }
  }
  return features.length ? { type: "FeatureCollection", features } : null;
}

// Kennzahlen der Mieten im Gebiet
function mietKennzahlen(miete) {
  if (!miete) return {};
  const werte = miete.features.map((f) => f.properties.wert).sort((a, b) => a - b);
  return {
    mieteZellen: werte.length,
    mieteMittel: werte.reduce((a, b) => a + b, 0) / werte.length,
    mieteMedian: werte[Math.floor(werte.length / 2)],
    mieteMin: werte[0],
    mieteMax: werte[werte.length - 1],
    mieteUnsicher: miete.features.filter((f) => f.properties.unsicher).length
  };
}
