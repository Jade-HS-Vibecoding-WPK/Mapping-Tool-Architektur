/* ============================================================
   Ortsanalyse – amtliche LoD2-Gebäude (Dachformen)
   - lädt die eingebauten Oldenburger LoD2-Daten (data/beispiel-oldenburg-lod2.js)
   - rechnet UTM 32 (Meter) in Längen-/Breitengrade um (Bibliothek proj4)
   - liefert die Dachflächen als schattierte Flächen für den Lageplan
   ============================================================ */

proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const utmZuGrad = (e, n) => proj4("EPSG:25832", "EPSG:4326", [e, n]);
const gradZuUtm = (lon, lat) => proj4("EPSG:4326", "EPSG:25832", [lon, lat]);

function ladeBeispielLod2() {
  if (window.BEISPIEL_LOD2) return Promise.resolve(window.BEISPIEL_LOD2);
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = "data/beispiel-oldenburg-lod2.js";
    s.onload = () => ok(window.BEISPIEL_LOD2);
    s.onerror = () => fehler(new Error("LoD2-Beispieldaten nicht gefunden"));
    document.head.appendChild(s);
  });
}

// Überschneidet sich das Rechteck mit dem Oldenburger Beispielgebiet?
function beruehrtBeispielgebiet([w, s, o, n]) {
  const [bw, bs, bo, bn] = BEISPIEL_GEBIET;
  return w < bo && o > bw && s < bn && n > bs;
}

// Wandelt die gespeicherten Gebäude in ein bequemes Format um:
// Punkte in Metern (x = Ost, y = Nord relativ zum Nullpunkt, z = über Boden)
function lod2Gebaeude(daten, bbox) {
  const [e0, n0] = daten.nullpunkt;
  const k = daten.einheit;
  const [w, s, o, n] = bbox;
  const ergebnis = [];
  for (const [id, funktion, dachform, hoehe, basis, flaechen, herkunft] of daten.gebaeude) {
    const f = flaechen.map(([typ, ...ringe]) => ({
      typ,
      ringe: ringe.map((r) => {
        const pts = [];
        for (let i = 0; i < r.length; i += 3) pts.push([r[i] * k, r[i + 1] * k, r[i + 2] * k]);
        return pts;
      })
    }));
    // Mittelpunkt des Gebäudes (aus den Dachpunkten) muss im Rechteck liegen
    const dach = f.filter((x) => x.typ === "R").flatMap((x) => x.ringe[0]);
    const punkte = dach.length ? dach : f.flatMap((x) => x.ringe[0]);
    if (!punkte.length) continue;
    const mx = punkte.reduce((a, p) => a + p[0], 0) / punkte.length;
    const my = punkte.reduce((a, p) => a + p[1], 0) / punkte.length;
    const [lon, lat] = utmZuGrad(e0 + mx, n0 + my);
    if (lon < w || lon > o || lat < s || lat > n) continue;
    // herkunft "T" = aus topoexport (Dreiecksnetz), sonst CityGML
    ergebnis.push({ id, funktion, dachform, hoehe, basis, flaechen: f, quelle: herkunft === "T" ? "topoexport" : "citygml" });
  }
  return ergebnis;
}

// Liegt ein Punkt (lon/lat) dort, wo LoD2-Gebäude vorliegen (CityGML-Kachel oder topoexport-Ausschnitt)?
function inLod2Abdeckung(daten, lon, lat) {
  const [e, n] = gradZuUtm(lon, lat);
  const x = e - daten.nullpunkt[0], y = n - daten.nullpunkt[1];
  const flaechen = daten.kacheln.concat(daten.topoexport ? [daten.topoexport.rahmen] : []);
  return flaechen.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
}

// ---------- Amtliche Straßenflächen (topoexport, LGLN) ----------
function ladeBeispielStrassen() {
  if (window.BEISPIEL_STRASSEN) return Promise.resolve(window.BEISPIEL_STRASSEN);
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = "data/beispiel-oldenburg-strassen.js";
    s.onload = () => ok(window.BEISPIEL_STRASSEN);
    s.onerror = () => fehler(new Error("Straßen-Beispieldaten nicht gefunden"));
    document.head.appendChild(s);
  });
}

// Straßenflächen als GeoJSON, auf das Rechteck zugeschnitten
function strassenflaechenGeoJSON(daten, bbox) {
  const [e0, n0] = daten.nullpunkt;
  const k = daten.einheit;
  const features = [];
  for (const poly of daten.flaechen) {
    const coords = poly.map((r) => {
      const ring = [];
      for (let i = 0; i < r.length; i += 2) ring.push(utmZuGrad(e0 + r[i] * k, n0 + r[i + 1] * k));
      ring.push(ring[0]);
      return ring;
    });
    const teil = schneide({ type: "Feature", geometry: { type: "Polygon", coordinates: coords }, properties: {} }, bbox);
    if (teil) { teil.properties = { quelle: "amtlich" }; features.push(teil); }
  }
  return { type: "FeatureCollection", features };
}

// OSM-Straßen, die NICHT von amtlichen Straßenflächen bedeckt sind (nur sie werden aus OSM als Fläche
// gezeichnet). Die amtlichen Daten enthalten nur das Hauptstraßennetz; Wohnstraßen, Fußgängerzonen
// usw. kommen weiter aus OSM. Jede Linie wird in Abschnitte zerlegt; Abschnitte, deren Mitte in einer
// amtlichen Fläche liegt, fallen weg.
function strassenAusserhalb(strassen, amtlich) {
  const flaechen = amtlich.features.map((p) => ({ p, b: turf.bbox(p) }));
  const bedeckt = ([x, y]) => flaechen.some(({ p, b }) =>
    x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && turf.booleanPointInPolygon([x, y], p));
  const features = [];
  for (const f of strassen.features) {
    const linien = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const linie of linien) {
      let stueck = [];
      for (let i = 0; i < linie.length - 1; i++) {
        const mitte = [(linie[i][0] + linie[i + 1][0]) / 2, (linie[i][1] + linie[i + 1][1]) / 2];
        if (bedeckt(mitte)) {
          if (stueck.length > 1) features.push(turf.lineString(stueck, f.properties));
          stueck = [];
        } else {
          if (!stueck.length) stueck.push(linie[i]);
          stueck.push(linie[i + 1]);
        }
      }
      if (stueck.length > 1) features.push(turf.lineString(stueck, f.properties));
    }
  }
  return { type: "FeatureCollection", features };
}

// Normale einer ebenen Fläche (Newell-Verfahren), Länge 1
function normale(ring) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1, z1] = ring[i], [x2, y2, z2] = ring[(i + 1) % ring.length];
    nx += (y1 - y2) * (z1 + z2);
    ny += (z1 - z2) * (x1 + x2);
    nz += (x1 - x2) * (y1 + y2);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// Grauton einer Dachfläche: Licht von Nordwesten, 45° hoch (wie in Plänen üblich).
// Nach Nordwesten geneigte Flächen werden hell, nach Südosten geneigte dunkler.
const LICHT = [-0.5, 0.5, Math.SQRT1_2];
function dachTon(n) {
  if (n[2] < 0) n = n.map((v) => -v); // Normale nach oben drehen
  const hell = Math.max(0, n[0] * LICHT[0] + n[1] * LICHT[1] + n[2] * LICHT[2]);
  const grau = Math.round(255 * (0.5 + 0.47 * hell));
  return `rgb(${grau},${grau},${Math.max(0, grau - 3)})`;
}

// Dachflächen als GeoJSON (für den Lageplan), jede Fläche mit eigenem Grauton
function dachflaechenGeoJSON(daten, gebaeude, bbox) {
  const [e0, n0] = daten.nullpunkt;
  const features = [];
  for (const g of gebaeude) {
    for (const f of g.flaechen) {
      if (f.typ !== "R" || f.ringe[0].length < 3) continue;
      const n = normale(f.ringe[0]);
      if (Math.abs(n[2]) < 0.05) continue; // senkrechte „Dächer“ sieht man von oben nicht
      const coords = f.ringe.map((r) => {
        const ring = r.map(([x, y]) => utmZuGrad(e0 + x, n0 + y));
        ring.push(ring[0]);
        return ring;
      });
      const feature = { type: "Feature", geometry: { type: "Polygon", coordinates: coords },
        properties: { farbe: dachTon(n) } };
      const teil = schneide(feature, bbox);
      if (teil) { teil.properties = feature.properties; features.push(teil); }
    }
  }
  return { type: "FeatureCollection", features };
}
